// this is CloudFront Function, not a lambda@edge. See https://aws.amazon.com/blogs/aws/introducing-cloudfront-functions-run-your-code-at-the-edge-with-low-latency-at-any-scale/
// JavaScript -> ECMAScript 5.1 compliant
// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-features.html#writing-functions-javascript-features-builtin-objects

var FILE_REGEX = new RegExp("\\/.*[\\w\\d]+\\.[\\w\\d]+$");

function handler(event) {
    var request = event.request;

    // if navigation request
    if (!FILE_REGEX.test(request.uri)) {
        request.uri = `/index.html`;
    }

    return request;
}
