import { App } from "aws-cdk-lib";

import { HostingStack } from "./hosting-stack";

class Main extends App {
    constructor() {
        super();

        const region = "us-east-1";
        const accountId = "643577437663";
        const projectName = "about-myself";

        const env = { region };

        const tags = {
            project: projectName
        };

        const commonParams = {
            projectName,
            accountId,
            env,
            tags
        };

        new HostingStack(this, `${projectName}-hosting`, {
            ...commonParams,

            domainName: "oleksiipopov.com",
            additionalNames: [
                "dev.oleksiipopov.com"
            ],
            hostedZoneId: "Z1O5PNX51MI59R",
            zoneName: "oleksiipopov.com",
            originBucketName: `${projectName}-hosting`,
            originBucketRegion: region,
        });
    }
}

new Main();
