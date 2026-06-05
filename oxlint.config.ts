import next from "@howells/lint/oxlint/next";
import { disabledReactDoctorRules } from "@howells/lint/oxlint/react-doctor-rules";

const legacyCompatibilityRules = {
  complexity: "off",
  "default-case": "off",
  "func-style": "off",
  "import/consistent-type-specifier-style": "off",
  "jsx-a11y/control-has-associated-label": "off",
  "no-inline-comments": "off",
  "no-negated-condition": "off",
  "no-nested-ternary": "off",
  "no-plusplus": "off",
  "no-shadow": "off",
  "no-use-before-define": "off",
  "prefer-destructuring": "off",
  "promise/prefer-await-to-callbacks": "off",
  "promise/prefer-await-to-then": "off",
  "require-unicode-regexp": "off",
  "sort-keys": "off",
  "typescript/no-dynamic-delete": "off",
  "unicorn/consistent-function-scoping": "off",
  "unicorn/no-array-sort": "off",
  "unicorn/no-lonely-if": "off",
  "unicorn/no-negated-condition": "off",
  "unicorn/no-nested-ternary": "off",
};

export default {
  extends: [next],
  ignorePatterns: ["dist/**", "node_modules/**"],
  rules: {
    ...disabledReactDoctorRules,
    ...legacyCompatibilityRules,
  },
  overrides: [
    {
      files: ["src/**", "test/**", "tsdown.config.ts"],
      rules: {
        ...disabledReactDoctorRules,
        ...legacyCompatibilityRules,
      },
    },
  ],
};
