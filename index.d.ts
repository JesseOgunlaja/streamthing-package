type CreateTokenConfig = {
	channel: string;
	password: string;
};

export async function createToken(config: CreateTokenConfig): Promise<string>;

type ClientStream = {
	receive(event: string, callback: (data: string) => unknown): void;
	disconnect(): void;
};

type CreateClientStreamConfig = {
	region: string;
	id: string;
	token: string;
};

export function createClientStream(
	config: CreateClientStreamConfig,
): ClientStream;

type ServerStreamConfig = {
	id: string;
	region: string;
	password: string;
};

type ServerStream = {
	send(channel: string, event: string, msg: string): void;
};

export function createServerStream(config: ServerStreamConfig): ServerStream;
