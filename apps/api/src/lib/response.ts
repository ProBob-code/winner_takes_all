export function notImplemented(feature: string) {
  return {
    ok: false,
    statusCode: 501,
    message: `${feature} is scaffolded but not implemented yet`
  };
}
