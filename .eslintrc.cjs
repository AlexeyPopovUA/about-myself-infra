module.exports = {
    extends: [
        // By extending from a plugin config, we can get recommended rules without having to add them manually.
        "eslint:recommended",
        "plugin:import/recommended",
        "plugin:@typescript-eslint/recommended",
        // This disables the formatting rules in ESLint that Prettier is going to be responsible for handling.
        // Make sure it's always the last config, so it gets the chance to override other configs.
        "eslint-config-prettier"
    ],
    settings: {
        // Tells eslint how to resolve imports
        "import/resolver": {
            node: {
                paths: ["src"],
                extensions: [".js", ".ts"]
            }
        }
    },
    rules: {
        "import/no-named-as-default-member": "off",
        "@typescript-eslint/ban-ts-comment": "warn"
    }
};
