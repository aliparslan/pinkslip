declare module "web-push" {
  const webpush: {
    generateVAPIDKeys(): {
      publicKey: string;
      privateKey: string;
    };
  };

  export default webpush;
}
