import { reactInternalConfig } from "@plinth/eslint-config/react-internal";

export default [
  ...reactInternalConfig,
  {
    rules: {
      // Index keys are what this template's lists have: authored content with
      // no ids, where repeats are allowed (and DotMap draws each position three
      // times), so content keys would collide. They are also harmless here.
      // Templates only render on the server, in the site build and in the
      // dashboard preview (which reloads the page on every draft change). They
      // are never hydrated, so no client state exists for a key to keep in place.
      "@eslint-react/no-array-index-key": "off",
    },
  },
];
