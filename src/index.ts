import * as discord from "discord.js";
import * as fs from "fs";
import * as child_process from "child_process";

type Middleware = (eventData:EventData,obj:DiscordObj)=>void;
type MessageHandler = (message:string,eventdata:EventData,messageObj:discord.Message)=>void;
type DiscordObj = discord.Base;
type EventHandler = (eventdata:EventData, obj:DiscordObj)=>void;
interface PagloseModule{
    middleware?:Middleware,
    onMessage?:MessageHandler,
    onEvent?:EventHandler
};
interface ConfigFile{
    version:string,
    install?:string,
    init?:string,
    module:string | PagloseModule
    requires?:{},
    location?:string
};
interface EventData{
    message?:string,
    name:string,
    [key:string]:unknown
};

let dir =  fs.opendirSync(__dirname);
let configFiles:{[key:string]: ConfigFile} = {};

let registeredMiddleware:Middleware[] = [];
let registeredMessageHandlers:MessageHandler[] = [];
let registeredEventHandlers:EventHandler[] = [];

let folderCount = 0;
for(let ent = dir.readSync();ent != null; dir.readSync()){
    if(!ent.isDirectory()){
	continue;
    }
    folderCount-=-1;
    fs.readFile(ent.name,{encoding:"utf8"} , (err, data)=>{
	if(err){
	    console.error(err);
	    return;
	}
	let config = JSON.parse(data);
	configFiles[ent.name] = config;
	configFiles[ent.name].location = `${__dirname}/${ent.name}`;
    });
}
let interval = setInterval(()=>{
    let tempCounter = 0;
    for(let i in configFiles) tempCounter-=-1;
    if(tempCounter == folderCount){
	clearInterval(interval);
	startInstall();
	startInit();
	mapModules();
	initHandlers();
    }
},50);
/**
 * runs all the install scripts for the modules
*/
function startInstall(){
    for(let loc in configFiles){
	if(configFiles[loc].install){
	    child_process.execSync(`${configFiles[loc].location}/${configFiles[loc].install}`);
	}
    }   
}
/**
 * runs all the init scripts for the modules
*/
function startInit(){
    for(let loc in configFiles){
	if(configFiles[loc].init){
	    child_process.execSync(`${configFiles[loc].location}/${configFiles[loc].init}`);
	}
    }   
}
/**
 * maps all the config file modules into actual node modules we can more easily work with
*/
function mapModules(){
    for(let loc in configFiles){
	if(typeof(configFiles[loc].module) === "string"){
	    configFiles[loc].module = require(`${configFiles[loc].location}/${configFiles[loc].module}`)
	}
    }
}
function initHandlers(){
    for(let loc in configFiles){
	let module = configFiles[loc].module;
	if(typeof module === "string") continue;
	for(let loc in configFiles){
	    if(typeof module !== "string"){
		if(module.middleware){
		    registeredMiddleware.push(module.middleware);
		}
		if(module.onMessage){
		    registeredMessageHandlers.push(module.onMessage);
		}
		if(module.onEvent){
		    registeredEventHandlers.push(module.onEvent);
		}
	    }
	}
    }
    //usage of any type isn't desirable but it's necessary so we can hack the event emitter to read all the events
    let client:any = new discord.Client();
    client.on("ready",()=>console.log("Bot is ready"));
    client.on("message",handleMessage);
    let oldEmit = client.emit;
    client.emit = function(){
	let emitArgs = arguments;
	if(emitArgs[0] !== "ready" && emitArgs[0] !== "message"){
	    handleEvent(emitArgs[0], emitArgs[1]);
	}
	oldEmit.apply(client, arguments);
    }
    client.login(process.env.PAGLOSE_DISCORD_TOKEN);
}
function handleMessage(message:discord.Message):void{
    let data:EventData = {
	message:message.content,
	name:"message"
    };
    for(let middleware of registeredMiddleware){
	middleware(data,message);
    }
    for(let handler of registeredMessageHandlers){
	handler(data.message,data, message);
    }
}
function handleEvent(name:string,obj:DiscordObj):void{
    let data:EventData = {
	name:name
    }
    for(let middleware of registeredMiddleware){
	middleware(data,obj);
    }
    for(let handler of registeredEventHandlers){
	handler(data, obj);
    }
}
