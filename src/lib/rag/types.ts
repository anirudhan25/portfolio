export interface RagChunk {
	id: string;
	heading: string;
	headingPath: string[];
	text: string;
	chunkIndex: number;
	source: string;
	sourceType: 'cv' | 'doc';
	tags: string[];
	charCount: number;
	tokenCount: number;
}

export interface RagStore {
	chunks: RagChunk[];
	tf: Record<string, Record<string, number>>;
	idf: Record<string, number>;
	builtAt: number;
}

export interface RetrievalResult {
	chunk: RagChunk;
	score: number;
}

export interface LatencyTrace {
	sanitize: number;
	injectionCheck: number;
	retrieve: number;
	promptAssembly: number;
	groq: number;
	stream: number;
	total: number;
}

export interface TokenTrace {
	systemPromptTokens: number;
	retrievedChunkTokens: number;
	userMessageTokens: number;
	outputTokens: number;
	fullCvTokens: number;
	savedTokens: number;
}

export interface RequestTrace {
	id: string;
	timestamp: number;
	query: string;
	retrievedChunks: { id: string; heading: string; score: number }[];
	latency: LatencyTrace;
	tokens: TokenTrace;
	navigated: boolean;
	blocked: boolean;
	blockReason?: string;
}
