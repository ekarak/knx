import { Duplex } from 'stream'

declare module 'binary-protocol' {
	interface ProtocolConfig {
		read(this: Reader, propertyName: string): void
		write(this: Writer, value: any): void
	}

	interface Reader {
		define(name: string, config: ProtocolConfig): this
		clone(): this
		demand(howMany: number): this
		tap(callback: (value: any) => void): this
		enqueue(name: string, arg1: any, arg2: any): this
		prepend(fn: (arg: any) => void, arg1: any): this
		pushStack(item: any): this
		popStack(property: string, fn: (value: any) => void): this
		collect(property: string, fn: (value: any) => void): this
		loop(property: string, fn: (value: any) => void): this
		end(fn: () => void): this
		finally(fn: () => void): this
		reset(): this
		raw(property: string, length: number): this
		next(chunk?: any): any
		process(): any
		createLooper(property: string, fn: (value: any) => void): this
		[key: string]: any // method created with `define`
	}

	interface Writer {
		buffer: Buffer
		define(name: string, config: ProtocolConfig): this
		clone(): this
		allocate(howMany: number): this
		raw(buffer: Buffer): this
		forward(howMany: number): this
		tap(callback: (value: any) => void): this
		[key: string]: any // method created with `define`
	}

	interface Commander {
		define(name: string, config: ProtocolConfig): this
		clone(): this
		createReadStream(options: any): Reader
		createWriteStream(options: any): Writer
	}

	export default class BinaryProtocol {
		define(name: string, config: ProtocolConfig): this
		createReader(buffer: Buffer, offset?: number): Reader
		createWriter(buffer?: Buffer, offset?: number): Writer
		createCommander(duplex: Duplex): Commander
		[key: string]: any // method created with `define`
	}
}
