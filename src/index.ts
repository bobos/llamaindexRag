import { 
    Ollama, 
    FunctionTool, 
    ReActAgent,
    Settings
} from "llamaindex"
import 'dotenv/config'

async function main() {

    Settings.llm = new Ollama({
        model: "gemma2:2b",
    })
    /*
    Set up logging so we can see the work in progress.
    Available events:
    llm-start
    llm-end
    agent-start
    agent-end
    llm-tool-call
    llm-tool-result
    */
    Settings.callbackManager.on("llm-start", (event: any) => {
        console.log(`llm-start: ${JSON.stringify(event.detail)}`)
    })
    Settings.callbackManager.on("llm-end", (event: any) => {
        console.log(`llm-end: ${JSON.stringify(event.detail)}`)
    })
    Settings.callbackManager.on("agent-start", (event: any) => {
        console.log(`agent-start: ${JSON.stringify(event.detail)}`)
    })
    Settings.callbackManager.on("agent-end", (event: any) => {
        console.log(`agent-end: ${JSON.stringify(event.detail)}`)
    })
    Settings.callbackManager.on("llm-tool-call", (event: any) => {
        console.log(`tool-call: ${JSON.stringify(event.detail)}`)
    })
    Settings.callbackManager.on("llm-tool-result", (event: any) => {
        console.log(`tool-result: ${JSON.stringify(event.detail)}`)
    })

    interface CountWordInput {theString: string, theWord: string};

    const countWord = ({theString, theWord}: CountWordInput): string => {
        console.log(`tool called: ${theString}, ${theWord}`)
	return `${theString.split(theWord).length -1}`;
    }

    const tools = [
        FunctionTool.from(
            countWord,
            {
                name: "countWord",
                description: "Use this function to count how many times a word appear in a given string",
                parameters: {
                    type: "object",
                    properties: {
                        theString: {
                            type: "string",
                            description: "The string to check how many times a given word appears"
                        },
                        theWord: {
                            type: "string",
                            description: "The word to check how many times it appears in a string"
                        },
                    },
                    required: ["theString", "theWord"]
                }
            }
        )
    ]

    const agent = new ReActAgent({tools})

    let response = await agent.chat({
        message: `how many letter l in "defaultCellStyle"`,
        stream: true
    })
    const result = await response.getReader().read();
    console.log(JSON.stringify(result))

}

main().catch(console.error);
