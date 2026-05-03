import webpush from "web-push";
const vapidKeys = webpush.generateVAPIDKeys();
console.log("Add these as Cloudflare Worker secrets:\n");
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
