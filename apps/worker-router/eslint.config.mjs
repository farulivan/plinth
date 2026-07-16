import { config } from "@plinth/eslint-config/base";

export default [...config, { ignores: ["worker-configuration.d.ts", ".wrangler/"] }];
