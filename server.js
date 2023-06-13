require("dotenv").config({ path: "./.env" });
const WebSocket = require("ws");
const { Model, SpeakerModel, Recognizer, setLogLevel } = require("vosk");

setLogLevel(0);

function processChunk(rec, message) {
  if (message === '{"eof" : 1}') {
    return [rec.finalResult(rec), true];
  } else if (rec.acceptWaveform(message)) {
    return [rec.result(), false];
  } else {
    return [rec.partialResult(), false];
  }
}

async function recognizer(websocket, message, model, spkModel, configs = {}) {
  let sampleRate = configs.sampleRate || 16000;
  let showWords = configs.showWords || false;
  let maxAlternatives = configs.maxAlternatives || 0;
  let setPartialWords = configs.setPartialWords || false;
  let phraseList = configs.phraseList || null;
  let rec;

  if (phraseList) {
    rec = new Recognizer({
      model: model,
      sampleRate: sampleRate,
      phraseList: JSON.stringify(phraseList),
    });
  } else {
    rec = new Recognizer({ model: model, sampleRate: sampleRate });
  }
  rec.setMaxAlternatives(maxAlternatives);
  rec.setWords(showWords);
  rec.setPartialWords(setPartialWords);
  if (spkModel) {
    rec.setSpkModel(spkModel);
  }
  const [response, stop] = processChunk(rec, message);
  // await websocket.send(JSON.stringify(response));
  console.log(response);
  await websocket.send(JSON.stringify(rec.finalResult(rec)));
  rec.free();
}

async function start() {
  let model;
  let spkModel;
  let args = {};

  args.interface = process.env.VOSK_SERVER_INTERFACE || "0.0.0.0";
  args.port = parseInt(process.env.VOSK_SERVER_PORT) || 2700;
  args.model_path = process.env.VOSK_MODEL_PATH || "model";
  args.spk_model_path = process.env.VOSK_SPK_MODEL_PATH || "";
  args.sample_rate = parseFloat(process.env.VOSK_SAMPLE_RATE) || 16000;
  args.max_alternatives = parseInt(process.env.VOSK_ALTERNATIVES) || 0;
  args.show_words = process.env.VOSK_SHOW_WORDS
    ? process.env.VOSK_SHOW_WORDS === "true"
    : true;

  if (process.argv.length > 2) {
    args.model_path = process.argv[2];
  }

  model = new Model(args.model_path);
  spkModel = args.spk_model_path ? new SpeakerModel(args.spk_model_path) : null;

  const wss = new WebSocket.Server({ port: args.port, host: args.interface });
  console.log(`Server listening on ${args.interface}:${args.port}`);

  wss.on("connection", (websocket, req) => {
    console.log(`Connection from ${req.socket.remoteAddress}`);

    websocket.on("message", async (message) => {
      await recognizer(websocket, message, model, spkModel, {
        sampleRate: args.sample_rate,
        maxAlternatives: args.max_alternatives,
        showWords: args.show_words,
      });
    });
  });
  wss.on("error", (err) => {
    setTimeout(() => {
      wss.close();
      start();
    }, 1000);
    console.error(err);
  });
}

start();
