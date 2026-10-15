import { loadEnvFiles } from "../src/env.ts";
import { loadConfig } from "../src/config.ts";
import { pingStripe } from "../src/stripe.ts";

loadEnvFiles();
const config = loadConfig();
const result = await pingStripe(config);
console.log(JSON.stringify(result, null, 2));
if (result.mode === "simulated") {
  console.log("No STRIPE_SECRET_KEY. Transfers stay simulated until a sk_test_ key is set.");
}
