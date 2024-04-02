declare module "binary-protocol" {

interface ProtocolConfig {
    read(propertyName: string): void
    write(value: any): void
}
  export class BinaryProtocol {
    define(name: string, config: ProtocolConfig): this
  }
}
