const CONFIG = {
    API: {
        API_KEY: 'sk-123456',
        API_CONFIGS: [
            { AUTH_TOKEN: "xx", CT0: "xx" },
            { AUTH_TOKEN: "xx", CT0: "xx" },
            { AUTH_TOKEN: "xx", CT0: "xx" },
            { AUTH_TOKEN: "xx", CT0: "xx" },
        ],
        ENDPOINTS: {
            CHAT: 'https://grok.x.com/2/grok/add_response.json',
            CREATE_CONVERSATION: 'https://x.com/i/api/graphql/vvC5uy7pWWHXS2aDi1FZeA/CreateGrokConversation',
            DELETE_CONVERSATION: 'https://x.com/i/api/graphql/TlKHSWVMVeaa-i7dqQqFQA/ConversationItem_DeleteConversationMutation',
            UPLOAD_IMAGE: 'https://x.com/i/api/2/grok/attachment.json'
        }
    },
    MODELS: {
        "grok-3": "grok-3",
        "grok-3-deepsearch": "grok-3",
        "grok-3-reasoning": "grok-3",
        "grok-3-imageGen": "grok-3",
    },
    IS_IMG_GEN: false,
    ISSHOW_SEARCH_RESULTS: false, //是否显示思考过程
    IS_THINKING: false
};
const DEFAULT_HEADERS = {
    'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept': '*/*',
    'content-type': 'text/plain;charset=UTF-8',
    'origin': 'https://x.com',
    'sec-fetch-site': 'same-site',
    'sec-fetch-mode': 'cors',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'zh-CN,zh;q=0.9',
    'priority': 'u=1, i'
};
class Utils {
    static lastUsedApiConfig = null;
    
    static generateRandomString(length, charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        return Array(length).fill(null)
            .map(() => charset[Math.floor(Math.random() * charset.length)])
            .join('');
    }
    static createAuthHeaders() {
        const randomConfig = CONFIG.API.API_CONFIGS[Math.floor(Math.random() * CONFIG.API.API_CONFIGS.length)];
        Utils.lastUsedApiConfig = randomConfig;
        return {
            ...DEFAULT_HEADERS,
            'x-csrf-token': randomConfig.CT0,
            'cookie': `auth_token=${randomConfig.AUTH_TOKEN};ct0=${randomConfig.CT0}`
        };
    }
    static async handleApiResponse(response, errorMessage) {
        if (!response.ok) {
            throw new Error(`${errorMessage} Status: ${response.status}`);
        }
        return await response.json();
    }
    static getImageMimeType(base64String) {
        const matches = base64String.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
        return matches ? matches[1] : 'image/jpeg';
    }
    static base64ToUint8Array(base64String) {
        if (base64String.includes('data:image')) {
            const base64Data = base64String.split(',')[1];
            return Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        } else {
            return Uint8Array.from(atob(base64String), c => c.charCodeAt(0));
        }
    }
}
class ConversationManager {
    static async generateNewId() {
        const response = await fetch(CONFIG.API.ENDPOINTS.CREATE_CONVERSATION, {
            method: 'POST',
            headers: Utils.createAuthHeaders(),
            body: JSON.stringify({
                variables: {},
                queryId: "vvC5uy7pWWHXS2aDi1FZeA"
            })
        });
        const data = await Utils.handleApiResponse(response, '创建会话失败!');
        return data.data.create_grok_conversation.conversation_id;
    }
    static async deleteConversation(conversationId) {
        if (!conversationId) return;
        await fetch(CONFIG.API.ENDPOINTS.DELETE_CONVERSATION, {
            method: 'POST',
            headers: Utils.createAuthHeaders(),
            body: JSON.stringify({
                variables: { conversationId },
                queryId: "TlKHSWVMVeaa-i7dqQqFQA"
            })
        });
    }
}
class MessageProcessor {
    static createChatResponse(message, model, isStream = false) {
        const baseResponse = {
            id: `chatcmpl-${crypto.randomUUID()}`,
            created: Math.floor(Date.now() / 1000),
            model: model
        };
        if (isStream) {
            return {
                ...baseResponse,
                object: 'chat.completion.chunk',
                choices: [{
                    index: 0,
                    delta: { content: message }
                }]
            };
        }
        return {
            ...baseResponse,
            object: 'chat.completion',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: message
                },
                finish_reason: 'stop'
            }],
            usage: null
        };
    }
    static processMessageContent(content) {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            if (content.some(item => item.type === 'image_url')) return null;
            return content
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join('\n');
        }
        if (typeof content === 'object') return content.text || null;
        return null;
    }
}
class TwitterGrokApiClient {
    constructor(modelId) {
        if (!CONFIG.MODELS[modelId]) {
            throw new Error(`不支持的模型: ${modelId}`);
        }
        this.modelId = CONFIG.MODELS[modelId];
        this.modelType = {
            isDeepSearch: modelId === 'grok-3-deepsearch',
            isReasoning: modelId === 'grok-3-reasoning'
        };
    }
    async uploadImage(imageData) {
        const formData = new FormData();
        const imageArray = Utils.base64ToUint8Array(imageData);
        const mimeType = Utils.getImageMimeType(imageData);
        const imageBlob = new Blob([imageArray], { type: mimeType });
        formData.append('photo', imageBlob, 'image.png');
        const response = await fetch(CONFIG.API.ENDPOINTS.UPLOAD_IMAGE, {
            method: 'POST',
            headers: Utils.createAuthHeaders(),
            body: formData
        });
        return await Utils.handleApiResponse(response, '图片上传失败');
    }
    removeThinkTags(text) {
        text = text.replace(/[\s\S]*?<\/think>/g, '').trim();
        text = text.replace(/!$$image$$$data:.*?base64,.*?$/g, '[图片]');
        return text;
    }
    async transformMessages(messages) {
        if (messages[0].role === 'assistant') {
            throw new Error('ai不能是第一个消息');
        }
        const processedMessages = [];
        let currentMessage = null;
        for (const msg of messages) {
            const normalizedMsg = msg.role === 'system' ? { ...msg, role: 'user' } : msg;
            if (!currentMessage || currentMessage.role !== normalizedMsg.role) {
                if (currentMessage) {
                    const processedContent = await this.processMessageContent(
                        currentMessage,
                        processedMessages.length >= messages.length - 2
                    );
                    if (processedContent) {
                        processedMessages.push(processedContent);
                    }
                }
                currentMessage = normalizedMsg;
            } else {
                currentMessage.content = typeof currentMessage.content === 'string' && typeof normalizedMsg.content === 'string'
                    ? `${currentMessage.content}\n${normalizedMsg.content}`
                    : normalizedMsg.content;
            }
        }
        if (currentMessage) {
            const processedContent = await this.processMessageContent(
                currentMessage,
                true
            );
            if (processedContent) {
                processedMessages.push(processedContent);
            }
        }
        return processedMessages;
    }
    async processMessageContent(msg, isLastTwoMessages) {
        const { role, content } = msg;
        let message = '';
        let fileAttachments = [];
        if (typeof content === 'string') {
            message = this.removeThinkTags(content);
        } else if (Array.isArray(content) || typeof content === 'object') {
            const { text, imageAttachments } = await this.processComplexContent(content, isLastTwoMessages);
            message = this.removeThinkTags(text);
            fileAttachments = imageAttachments;
        }
        return {
            message,
            sender: role === 'assistant' ? 2 : 1,
            ...(role === 'user' && { fileAttachments })
        };
    }
    async processComplexContent(content, isLastTwoMessages) {
        let text = '';
        let imageAttachments = [];
        const processItem = async (item) => {
            if (item.type === 'text') {
                text += item.text;
            } else if (item.type === 'image_url' && item.image_url.url.includes('data:image')) {
                if (isLastTwoMessages) {
                    const uploadResult = await this.uploadImage(item.image_url.url);
                    if (Array.isArray(uploadResult)) {
                        imageAttachments.push(...uploadResult);
                    }
                } else {
                    text += '[图片]';
                }
            }
        };
        if (Array.isArray(content)) {
            await Promise.all(content.map(processItem));
        } else {
            await processItem(content);
        }
        return { text, imageAttachments };
    }
    async prepareChatRequest(request) {
        const responses = await this.transformMessages(request.messages);
        const conversationId = await ConversationManager.generateNewId();
        return {
            responses,
            systemPromptName: "",
            grokModelOptionId: this.modelId,
            conversationId,
            returnSearchResults: this.modelType.isReasoning,
            returnCitations: this.modelType.isReasoning,
            promptMetadata: {
                promptSource: "NATURAL",
                action: "INPUT"
            },
            imageGenerationCount: 1,
            requestFeatures: {
                eagerTweets: false,
                serverHistory: false
            },
            enableCustomization: true,
            enableSideBySide: false,
            toolOverrides: {
                imageGen: request.model === 'grok-3-imageGen',
            },
            isDeepsearch: this.modelType.isDeepSearch,
            isReasoning: this.modelType.isReasoning
        };
    }
}
class ResponseHandler {
    static async handleStreamResponse(response, model) {
        let imageUrl = null;
        const reader = response.body.getReader();
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = '';
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        const result = await this.processStreamLine(JSON.parse(line), model, CONFIG.IS_THINKING);
                        imageUrl = result.imageUrl || imageUrl;
                        if (imageUrl) {
                            const imageResponse = await this.handleImageGeneration(imageUrl, model);
                            var responseData = MessageProcessor.createChatResponse(imageResponse, model, true);
                            await writer.write(encoder.encode(`data: ${JSON.stringify(responseData)}\n\n`));
                            await writer.close();
                            return new Response(readable, {
                                headers: {
                                    'Content-Type': 'text/event-stream',
                                    'Cache-Control': 'no-cache',
                                    'Connection': 'keep-alive'
                                }
                            });
                        }
                        var responseData = MessageProcessor.createChatResponse(result.text, model, true);
                        await writer.write(encoder.encode(`data: ${JSON.stringify(responseData)}\n\n`));
                        CONFIG.IS_THINKING = result.isThinking;
                    }
                }
            } catch (error) {
                const tokenUsed = Utils.lastUsedApiConfig ? Utils.lastUsedApiConfig.AUTH_TOKEN : '未知';
                const replyText = `当前 api 报错，AUTH_TOKEN 为 ${tokenUsed}`;
                const responseData = MessageProcessor.createChatResponse(replyText, model, true);
                await writer.write(encoder.encode(`data: ${JSON.stringify(responseData)}\n\n`));
            } finally {
                await writer.write(encoder.encode('data: [DONE]\n\n'));
                await writer.close();
            }
        })();
        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
    }
    static async processStreamLine(jsonData, model, isThinking) {
        let result = { text: '', imageUrl: null, isThinking };
        if (jsonData.result?.message) {
            switch (model) {
                case "grok-3-reasoning":
                    result = this.processStreamReasoningMessage(jsonData, isThinking);
                    break;
                case "grok-3-deepsearch":
                    if (jsonData.result?.messageTag === "final") {
                        result.text = jsonData.result.message;
                    }
                    break;
                default:
                    result.text = jsonData.result.message;
            }
        }
        if (jsonData.result?.event?.imageAttachmentUpdate?.progress === 100) {
            result.imageUrl = jsonData.result.event.imageAttachmentUpdate.imageUrl;
        }
        return result;
    }
    static processStreamReasoningMessage(jsonData, isThinking) {
        let result = { text: '', imageUrl: null, isThinking };
        if (!CONFIG.ISSHOW_SEARCH_RESULTS && jsonData.result?.isThinking) return result;
        if (jsonData.result?.isThinking && !isThinking) {
            result.text = "\n" + jsonData.result.message;
            result.isThinking = true;
        } else if (isThinking && !jsonData.result?.isThinking) {
            result.text = "\n" + jsonData.result.message;
            result.isThinking = false;
        } else {
            result.text = jsonData.result.message;
        }
        return result;
    }
    static async handleImageGeneration(imageUrl, model) {
        const response = await fetch(imageUrl, {
            method: 'GET',
            headers: Utils.createAuthHeaders()
        });
        if (!response.ok) {
            throw new Error(`Image request failed: ${response.status}`);
        }
        const imageBuffer = await response.arrayBuffer();
        const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
        const imageContentType = response.headers.get('content-type');
        const responseData = MessageProcessor.createChatResponse(
            `![image](data:${imageContentType};base64,${base64Image})`,
            model
        );
        return responseData;
    }
    static async handleNormalResponse(response, model) {
        let fullResponse = '';
        let imageUrl = null;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim()) continue;
                const result = await this.processNormalLine(JSON.parse(line), model, CONFIG.IS_THINKING);
                fullResponse += result.text || '';
                imageUrl = result.imageUrl || imageUrl;
                CONFIG.IS_THINKING = result.isThinking;
            }
        }
        if (imageUrl) {
            return await this.createImageResponse(imageUrl, model);
        } else {
            return new Response(JSON.stringify(MessageProcessor.createChatResponse(fullResponse, model)), {
                headers: {
                    'Content-Type': 'application/json',
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization"
                }
            });
        }
    }
    static async processNormalLine(jsonData, model, isThinking) {
        let result = { text: '', imageUrl: null, isThinking };
        if (jsonData.result?.message) {
            switch (model) {
                case "grok-3-reasoning":
                    result = this.processReasoningMessage(jsonData, isThinking);
                    break;
                case "grok-3-deepsearch":
                    if (jsonData.result?.messageTag === "final") {
                        result.text = jsonData.result.message;
                    }
                    break;
                default:
                    result.text = jsonData.result.message;
            }
        }
        if (jsonData.result?.event?.imageAttachmentUpdate?.progress === 100) {
            result.imageUrl = jsonData.result.event.imageAttachmentUpdate.imageUrl;
        }
        return result;
    }
    static processReasoningMessage(jsonData, isThinking) {
        let result = { text: '', imageUrl: null, isThinking };
        if (!CONFIG.ISSHOW_SEARCH_RESULTS && jsonData.result?.isThinking) return result;
        if (jsonData.result?.isThinking && !isThinking) {
            result.text = "\n" + jsonData.result.message;
            result.isThinking = true;
        } else if (isThinking && !jsonData.result?.isThinking) {
            result.text = "\n" + jsonData.result.message;
            result.isThinking = false;
        } else {
            result.text = jsonData.result.message;
        }
        return result;
    }
    static async createImageResponse(imageUrl, model) {
        const response = await fetch(imageUrl, {
            method: 'GET',
            headers: Utils.createAuthHeaders()
        });
        if (!response.ok) {
            throw new Error(`Image request failed: ${response.status}`);
        }
        const imageBuffer = await response.arrayBuffer();
        const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
        const imageContentType = response.headers.get('content-type');
        const responseData = MessageProcessor.createChatResponse(
            `![image](data:${imageContentType};base64,${base64Image})`,
            model
        );
        return new Response(JSON.stringify(responseData), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
async function handleRequest(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*',
                'Access-Control-Allow-Headers': '*'
            }
        });
    }
    if (url.pathname === '/v1/models' && request.method === 'GET') {
        return new Response(JSON.stringify({
            object: "list",
            data: Object.keys(CONFIG.MODELS).map(model => ({
                id: model,
                object: "model",
                created: Math.floor(Date.now() / 1000),
                owned_by: "xgrok",
            }))
        }), {
            headers: {
                'Content-Type': 'application/json',
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*"
            }
        });
    }
    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
        try {
            const authToken = request.headers.get('authorization')?.replace('Bearer ', '');
            if (authToken !== CONFIG.API.API_KEY) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
            }
            const body = await request.json();
            const grokClient = new TwitterGrokApiClient(body.model);
            const requestPayload = await grokClient.prepareChatRequest(body);
            const response = await fetch(CONFIG.API.ENDPOINTS.CHAT, {
                method: 'POST',
                headers: Utils.createAuthHeaders(),
                body: JSON.stringify(requestPayload)
            });
            if (!response.ok) {
                throw new Error(`上游服务请求失败! status: ${response.status}`);
            }
            return body.stream
                ? await ResponseHandler.handleStreamResponse(response, body.model)
                : await ResponseHandler.handleNormalResponse(response, body.model);
        } catch (error) {
            let reqBody = {};
            try {
                reqBody = await request.json();
            } catch (e) {
                reqBody = {};
            }
            const tokenUsed = Utils.lastUsedApiConfig ? Utils.lastUsedApiConfig.AUTH_TOKEN : '未知';
            const replyText = `当前 api 报错，AUTH_TOKEN 为 ${tokenUsed}`;
            const chatResponse = MessageProcessor.createChatResponse(replyText, reqBody.model || 'grok-3');
            if (reqBody.stream) {
                const sseData = `data: ${JSON.stringify(chatResponse)}\n\n`;
                return new Response(sseData, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "*",
                        "Access-Control-Allow-Headers": "*"
                    }
                });
            } else {
                return new Response(JSON.stringify(chatResponse), {
                    headers: {
                        'Content-Type': 'application/json',
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "*",
                        "Access-Control-Allow-Headers": "*"
                    }
                });
            }
        }
    }
    return new Response(JSON.stringify({ error: '服务创建成功，正在运行' }), {
        status: 404,
        headers: {
            'Content-Type': 'application/json',
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
        }
    });
}
export default {
    async fetch(request, env, ctx) {
        return handleRequest(request);
    }
};