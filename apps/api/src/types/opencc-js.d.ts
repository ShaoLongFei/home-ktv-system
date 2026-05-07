declare module "opencc-js" {
  export function Converter(options: { from: string; to: string }): (value: string) => string;
}
