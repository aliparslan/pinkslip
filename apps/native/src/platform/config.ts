/** Production unless a development build points to a local Worker. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://pinkslip.work/api/v2";
export const WEB_URL = API_URL.replace(/\/api\/v2\/?$/, "");
