import { protectApi } from "../../lib/auth.js";
import { handleRegister } from "../../lib/authApi.js";

export default async function handler(req, res) {
  if (
    !(await protectApi(req, res, {
      methods: "POST, OPTIONS",
      optionalSession: true,
      rateLimit: { max: 10, bucket: "auth-register" },
    }))
  ) {
    return;
  }
  await handleRegister(req, res);
}
