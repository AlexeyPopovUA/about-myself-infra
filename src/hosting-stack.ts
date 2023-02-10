import { Construct } from "constructs";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {AaaaRecord, ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import {
    AllowedMethods,
    CachePolicy,
    Distribution,
    FunctionCode,
    Function as CFFunction,
    HeadersFrameOption,
    HeadersReferrerPolicy,
    HttpVersion,
    OriginAccessIdentity,
    OriginRequestCookieBehavior,
    OriginRequestHeaderBehavior,
    OriginRequestPolicy,
    OriginRequestQueryStringBehavior,
    PriceClass,
    ResponseHeadersPolicy,
    SecurityPolicyProtocol,
    ViewerProtocolPolicy,
    FunctionEventType
} from "aws-cdk-lib/aws-cloudfront";
import { Bucket, HttpMethods } from "aws-cdk-lib/aws-s3";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { resolve } from "node:path";

import MinimalPropsStack from "./minimal-props-stack";

type CurrentStackProps = MinimalPropsStack & {
    hostedZoneId: string;
    zoneName: string;

    domainName: string;
    additionalNames: string[];

    originBucketName: string;
    originBucketRegion: string;
};

export class HostingStack extends Stack {
    constructor(scope: Construct, id: string, props: CurrentStackProps) {
        super(scope, id, props);

        const hostedZone = HostedZone.fromHostedZoneAttributes(this, `${props.projectName}-plan-zone`, {
            hostedZoneId: props.hostedZoneId,
            zoneName: props.zoneName
        });

        const certificate = new Certificate(this, `${props.projectName}-certificate`, {
            domainName: props.domainName,
            subjectAlternativeNames: [
                ...props.additionalNames
            ],
            validation: CertificateValidation.fromDns(hostedZone)
        });

        const cf_fn_viewer_request = new CFFunction(this, `${props.projectName}-cf-fn-viewer-request`, {
            code: FunctionCode.fromFile({
                filePath: resolve("./src/cf-fn-viewer-request.js")
            }),
            comment: `Viewer request cloudfront function for redirections (${props.projectName})`
        });

        const originRequestPolicy = new OriginRequestPolicy(this, `${props.projectName}-origin-request`, {
            comment: `${props.projectName} origin request policy`,
            cookieBehavior: OriginRequestCookieBehavior.none(),
            // custom "domain-name" is generated in viewer request lambda
            headerBehavior: OriginRequestHeaderBehavior.allowList("domain-name"),
            queryStringBehavior: OriginRequestQueryStringBehavior.none()
        });

        const responseHeadersPolicy = new ResponseHeadersPolicy(this, `${props.projectName}-response-headers-policy`, {
            securityHeadersBehavior: {
                frameOptions: {
                    frameOption: HeadersFrameOption.SAMEORIGIN,
                    override: true
                },
                referrerPolicy: {
                    override: true,
                    referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN
                },
                xssProtection: {
                    protection: true,
                    modeBlock: true,
                    override: true
                }
            }
        });

        const originAccessIdentityProd = new OriginAccessIdentity(this, `${props.projectName}-origin-access-identity-prod`, {
            comment: `${props.domainName} prod access Identity`
        });
        const originAccessIdentityDev = new OriginAccessIdentity(this, `${props.projectName}-origin-access-identity-dev`, {
            comment: `${props.domainName} dev access Identity`
        });

        const originBucket = new Bucket(this, `${props.projectName}-origin-bucket`, {
            bucketName: props.originBucketName,
            removalPolicy: RemovalPolicy.RETAIN,

            publicReadAccess: false,
            cors: [
                {
                    allowedMethods: [HttpMethods.GET, HttpMethods.HEAD],
                    allowedOrigins: ["*"],
                    maxAge: 3000
                }
            ]
        });

        // todo Refactor to access control policy
        originBucket.grantRead(originAccessIdentityProd);
        originBucket.grantRead(originAccessIdentityDev);

        const prodDistribution = new Distribution(this, `${props.projectName}-distribution-prod`, {
            comment: `${props.projectName}-distribution-prod`,
            httpVersion: HttpVersion.HTTP2_AND_3,
            enableIpv6: true,
            priceClass: PriceClass.PRICE_CLASS_ALL,
            certificate,
            minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
            enableLogging: false,
            enabled: true,
            errorResponses: [
                {
                    ttl: Duration.seconds(0),
                    httpStatus: 400
                }
            ],
            domainNames: [
                props.domainName
            ],
            defaultBehavior: {
                allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachePolicy: CachePolicy.CACHING_OPTIMIZED,
                responseHeadersPolicy,
                compress: true,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                originRequestPolicy,
                origin: new S3Origin(originBucket, {
                    originAccessIdentity: originAccessIdentityProd,
                    originShieldRegion: props.originBucketRegion,
                    originPath: "/master"
                }),
                // CloudFront Functions
                functionAssociations: [
                    {
                        function: cf_fn_viewer_request,
                        eventType: FunctionEventType.VIEWER_REQUEST
                    }
                ]
            }
        });

        // hide behind the firewall
        const devDistribution = new Distribution(this, `${props.projectName}-distribution-dev`, {
            comment: `${props.projectName}-distribution-dev`,
            httpVersion: HttpVersion.HTTP2_AND_3,
            enableIpv6: false,
            priceClass: PriceClass.PRICE_CLASS_ALL,
            certificate,
            minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
            enableLogging: false,
            enabled: false,
            errorResponses: [
                {
                    ttl: Duration.seconds(0),
                    httpStatus: 400
                }
            ],
            domainNames: [
                ...props.additionalNames
            ],
            defaultBehavior: {
                allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                // todo Small TTL
                cachePolicy: CachePolicy.CACHING_OPTIMIZED,
                responseHeadersPolicy,
                compress: true,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                originRequestPolicy,
                origin: new S3Origin(originBucket, {
                    originAccessIdentity: originAccessIdentityDev,
                    originShieldRegion: props.originBucketRegion,
                    originPath: "/"
                }),
                // CloudFront Functions
                functionAssociations: [
                    {
                        function: cf_fn_viewer_request,
                        eventType: FunctionEventType.VIEWER_REQUEST
                    }
                ]
            }
        });

        new ARecord(this, `${props.projectName}-record-a`, {
            recordName: props.domainName,
            zone: hostedZone,
            target: RecordTarget.fromAlias(new CloudFrontTarget(prodDistribution))
        });

        new AaaaRecord(this, `${props.projectName}-record-aaaa`, {
            recordName: props.domainName,
            zone: hostedZone,
            target: RecordTarget.fromAlias(new CloudFrontTarget(prodDistribution))
        });

        props.additionalNames.forEach(name => {
            new ARecord(this, `${props.projectName}-record-a-${name.replace(props.domainName, "").replaceAll(".", "-")}`, {
                recordName: name,
                zone: hostedZone,
                target: RecordTarget.fromAlias(new CloudFrontTarget(devDistribution))
            });
        });
    }
}
