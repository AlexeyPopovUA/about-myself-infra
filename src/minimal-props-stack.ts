import { Environment } from "aws-cdk-lib";

type MinimalPropsStack = {
    projectName: string;
    env: Environment;
    accountId: string;
};

export default MinimalPropsStack;
