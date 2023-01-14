process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
import "./config.js";
import { createRequire } from "module"; // Bring in the ability to create the 'require' method
import glob from "glob";
import path, { join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { platform } from "process";
import YT from "youtubeposter.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

global.__filename = function filename(
  pathURL = import.meta.url,
  rmPrefix = platform !== "win32"
) {
  return rmPrefix
    ? /file:\/\/\//.test(pathURL)
      ? fileURLToPath(pathURL)
      : pathURL
    : pathToFileURL(pathURL).toString();
};
global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true));
};
global.__require = function require(dir = import.meta.url) {
  return createRequire(dir);
};

import * as ws from "ws";
import {
  readdirSync,
  statSync,
  unlinkSync,
  existsSync,
  readFileSync,
  watch,
  watchFile,
} from "fs";
import yargs from "yargs";
import { spawn } from "child_process";
import lodash from "lodash";
import chalk from "chalk";
import syntaxerror from "syntax-error";
import { tmpdir } from "os";
import { format } from "util";
import { makeWASocket, protoType, serialize } from "./lib/simple.js";
import { Low, JSONFile } from "lowdb";
import { mongoDB, mongoDBV2 } from "./lib/mongoDB.js";
import store from "./lib/store.js";
import cloudDBAdapter from "./lib/cloudDBAdapter.js";
const { DisconnectReason } = (await import("@adiwajshing/baileys")).default;

const { CONNECTING } = ws;
const { chain } = lodash;
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

protoType();
serialize();

global.API = (name, path = "/", query = {}, apikeyqueryname) =>
  (name in global.APIs ? global.APIs[name] : name) +
  path +
  (query || apikeyqueryname
    ? "?" +
      new URLSearchParams(
        Object.entries({
          ...query,
          ...(apikeyqueryname
            ? {
                [apikeyqueryname]:
                  global.APIKeys[
                    name in global.APIs ? global.APIs[name] : name
                  ],
              }
            : {}),
        })
      )
    : "");
global.timestamp = {
  start: new Date(),
};

const __dirname = global.__dirname(import.meta.url);
global.opts = new Object(
  yargs(process.argv.slice(2)).exitProcess(false).parse()
);
global.prefix = new RegExp(
  "^[" +
    (opts["prefix"] || "‎xzXZ/i!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-").replace(
      /[|\\{}()[\]^$+*?.\-\^]/g,
      "\\$&"
    ) +
    "]"
);

global.db = new Low(
  /https?:\/\//.test(opts["db"] || "")
    ? new cloudDBAdapter(opts["db"])
    : /mongodb(\+srv)?:\/\//i.test(opts["db"])
    ? opts["mongodbv2"]
      ? new mongoDBV2(opts["db"])
      : new mongoDB(opts["db"])
    : new JSONFile(`${opts._[0] ? opts._[0] + "_" : ""}database.json`)
);

global.DATABASE = global.db; // Backwards Compatibility
global.loadDatabase = async function loadDatabase() {
  if (global.db.READ)
    return new Promise((resolve) =>
      setInterval(async function () {
        if (!global.db.READ) {
          clearInterval(this);
          resolve(
            global.db.data == null ? global.loadDatabase() : global.db.data
          );
        }
      }, 1 * 1000)
    );
  if (global.db.data !== null) return;
  global.db.READ = true;
  await global.db.read().catch(console.error);
  global.db.READ = null;
  global.db.data = {
    users: {},
    chats: {},
    stats: {},
    msgs: {},
    sticker: {},
    settings: {},
    ...(global.db.data || {}),
  };
  global.db.chain = chain(global.db.data);
};
loadDatabase();

global.authFile = `${opts._[0] || "session"}.json`;
const { state, saveState } = store.useSingleFileAuthState(global.authFile);

const connectionOptions = {
  printQRInTerminal: true,
  auth: state,
};

global.conn = makeWASocket(connectionOptions);
conn.isInit = false;
global.YT = new YT.YoutubePoster({ loop_delays_in_min: 60000 });
global.YT.on("notified", async (data) => {
  await conn.sendButton(
    data.ChannelDATA.ChannelSend,
    `
*${htki} YOUTUBE NOTIFIKASI ${htka}*
*_${data.video.author.name}_* telah upload video baru!
${htjava} *Title:* ${data.video.title}
📤 *Published:* ${data.video.pubDateText}${
      data.video.link == data.video_2.url
        ? `\n⌚ *Duration:* ${data.video_2?.durationH}`
        : ""
    }
👁️ *Views:* ${data.video.viewsText}
🔗 *Url:* ${data.video.link}
📔 *Description:* ${
      data.video.description?.length
        ? data.video.description.split("\n").join(" ").substr(0, 105) + "..."
        : data.video.description
    }
  `.trim(),
    wm,
    data.video.thumbnail,
    [
      ["🎶 Audio", `!yta ${data.video.link} yes`],
      ["🎥 Video", `!ytv ${data.video.link} yes`],
      ["🔎 Youtube Search", `!yts ${data.video.link}`],
    ],
    null,
    fakes
  );
});
if (!opts["test"]) {
  setInterval(async () => {
    if (global.db.data) await global.db.write().catch(console.error);
    if (opts["autocleartmp"])
      try {
        await clearTmp();
        console.log(chalk.cyanBright("Successfully clear tmp"));
      } catch (e) {
        console.error(e);
        console.log(chalk.cyanBright("Failded clear tmp"));
      }
  }, 60 * 1000);
}
if (opts["server"]) (await import("./server.js")).default(PORT, global.conn);

/* Clear */
async function clearTmp() {
  const tmp = [tmpdir(), join(__dirname, "./tmp")];
  const filename = [];
  tmp.forEach((dirname) =>
    readdirSync(dirname).forEach((file) => filename.push(join(dirname, file)))
  );
  return filename.map((file) => {
    const stats = statSync(file);
    if (stats.isFile() && Date.now() - stats.mtimeMs >= 1000 * 60 * 3)
      return unlinkSync(file); // 3 minutes
    return false;
  });
}

/* Update */
async function connectionUpdate(update) {
  const { connection, lastDisconnect, isNewLogin } = update;
  if (isNewLogin) conn.isInit = true;
  const code =
    lastDisconnect?.error?.output?.statusCode ||
    lastDisconnect?.error?.output?.payload?.statusCode;
  if (
    code &&
    code !== DisconnectReason.loggedOut &&
    conn?.ws.readyState !== CONNECTING
  ) {
    console.log(await global.reloadHandler(true).catch(console.error));
    global.timestamp.connect = new Date();
  }
  if (global.db.data == null) loadDatabase();
  if (connection == "open") {
    console.log(chalk.yellow("Successfully connected by " + author));
  }
  console.log(JSON.stringify(update, null, 4));
  if (update.receivedPendingNotifications)
    return this.sendButton(
      nomorown + "@s.whatsapp.net",
      "Bot Successfully Connected",
      author,
      null,
      [["MENU", "/menu"]],
      null
    );
}

process.on("unhandledRejection", (reason, p) => {
  console.log(" [AntiCrash] :: Unhandled Rejection/Catch");
  console.log(reason, p);
});
process.on("uncaughtException", (err, origin) => {
  console.log(" [AntiCrash] :: Uncaught Exception/Catch");
  console.log(err, origin);
});
process.on("uncaughtExceptionMonitor", (err, origin) => {
  console.log(" [AntiCrash] :: Uncaught Exception/Catch (MONITOR)");
  console.log(err, origin);
});
process.on("multipleResolves", () => {
  null;
});
// let strQuot = /(["'])(?:(?=(\\?))\2.)*?\1/

let isInit = true;
let handler = await import("./handler.js");
global.reloadHandler = async function (restatConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`).catch(
      console.error
    );
    if (Object.keys(Handler || {}).length) handler = Handler;
  } catch (e) {
    console.error(e);
  }
  if (restatConn) {
    const oldChats = global.conn.chats;
    try {
      global.conn.ws.close();
    } catch {}
    conn.ev.removeAllListeners();
    global.conn = makeWASocket(connectionOptions, { chats: oldChats });
    isInit = true;
  }
  if (!isInit) {
    conn.ev.off("messages.upsert", conn.handler);
    conn.ev.off("group-participants.update", conn.participantsUpdate);
    conn.ev.off("groups.update", conn.groupsUpdate);
    conn.ev.off("message.delete", conn.onDelete);
    conn.ev.off("connection.update", conn.connectionUpdate);
    conn.ev.off("creds.update", conn.credsUpdate);
  }

  conn.welcome =
    "👋 Hallo @user\n\n                *W E L C O M E*\n⫹⫺ In @subject\n\n⫹⫺ Read *DESCRIPTION*\n@desc";
  conn.bye = "👋 Byee @user\n\n                *G O O D B Y E*";
  conn.spromote = "*@user* Sekarang jadi admin!";
  conn.sdemote = "*@user* Sekarang bukan lagi admin!";
  conn.sDesc = "Deskripsi telah diubah menjadi \n@desc";
  conn.sSubject = "Judul grup telah diubah menjadi \n@subject";
  conn.sIcon = "Icon grup telah diubah!";
  conn.sRevoke = "Link group telah diubah ke \n@revoke";
  conn.sAnnounceOn =
    "Group telah di tutup!\nsekarang hanya admin yang dapat mengirim pesan.";
  conn.sAnnounceOff =
    "Group telah di buka!\nsekarang semua peserta dapat mengirim pesan.";
  conn.sRestrictOn = "Edit Info Grup di ubah ke hanya admin!";
  conn.sRestrictOff = "Edit Info Grup di ubah ke semua peserta!";

  conn.handler = handler.handler.bind(global.conn);
  conn.participantsUpdate = handler.participantsUpdate.bind(global.conn);
  conn.groupsUpdate = handler.groupsUpdate.bind(global.conn);
  conn.onDelete = handler.deleteUpdate.bind(global.conn);
  conn.connectionUpdate = connectionUpdate.bind(global.conn);
  conn.credsUpdate = saveState.bind(global.conn, true);

  conn.ev.on("messages.upsert", conn.handler);
  conn.ev.on("group-participants.update", conn.participantsUpdate);
  conn.ev.on("groups.update", conn.groupsUpdate);
  conn.ev.on("message.delete", conn.onDelete);
  conn.ev.on("connection.update", conn.connectionUpdate);
  conn.ev.on("creds.update", conn.credsUpdate);

  isInit = false;
  return true;
};

global.plugins = {};
const pluginFilter = (filename) => /\.js$/.test(filename);
async function filesInit() {
  const uncache = (module) => {
    return new Promise((resolve, reject) => {
      try {
        delete global.__require.cache[global.__require.resolve(module)];
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  };
  const nocache = (module, call = () => {}) => {
    watchFile(module, async () => {
      //await uncache(global.__require.resolve(module));
      call(module);
    });
  };

  const CommandsFiles = glob.sync("./plugins/**/*.js");
  for (let file of CommandsFiles) {
    const filename = file.replace(/^.*[\\\/]/, "");
    try {
      const module = await import(file);
      global.plugins[file] = module.default || module;
      nocache(resolve(file), async (module) => {
        if (file in global.plugins) {
          if (existsSync(file))
            conn.logger.info(` updated plugin - '${filename}'`);
          else {
            conn.logger.warn(`deleted plugin - '${filename}'`);
            return delete global.plugins[filename];
          }
        } else conn.logger.info(`new plugin - '${filename}'`);
        let err = syntaxerror(readFileSync(file), filename, {
          sourceType: "module",
          allowAwaitOutsideFunction: true,
        });
        if (err)
          conn.logger.error(
            `syntax error while loading '${filename}'\n${format(err)}`
          );
        else
          try {
            const module = await import(
              `${global.__filename(file)}?update=${Date.now()}`
            );
            global.plugins[file] = module.default || module;
          } catch (e) {
            conn.logger.error(
              `error require plugin '${filename}\n${format(e)}'`
            );
          } finally {
            global.plugins = Object.fromEntries(
              Object.entries(global.plugins).sort(([a], [b]) =>
                a.localeCompare(b)
              )
            );
          }
      });
    } catch (e) {
      conn.logger.error(e);
      delete global.plugins[file];
    }
  }
}
filesInit()
  .then((_) => console.log(Object.keys(global.plugins)))
  .catch(console.error);

await global.reloadHandler();
/* QuickTest */
async function _quickTest() {
  let test = await Promise.all(
    [
      spawn("ffmpeg"),
      spawn("ffprobe"),
      spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-filter_complex",
        "color",
        "-frames:v",
        "1",
        "-f",
        "webp",
        "-",
      ]),
      spawn("convert"),
      spawn("magick"),
      spawn("gm"),
      spawn("find", ["--version"]),
    ].map((p) => {
      return Promise.race([
        new Promise((resolve) => {
          p.on("close", (code) => {
            resolve(code !== 127);
          });
        }),
        new Promise((resolve) => {
          p.on("error", (_) => resolve(false));
        }),
      ]);
    })
  );
  let [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test;
  console.log(test);
  let s = (global.support = {
    ffmpeg,
    ffprobe,
    ffmpegWebp,
    convert,
    magick,
    gm,
    find,
  });

  Object.freeze(global.support);

  if (!s.ffmpeg)
    conn.logger.warn(
      "Please install ffmpeg for sending videos (pkg install ffmpeg)"
    );
  if (s.ffmpeg && !s.ffmpegWebp)
    conn.logger.warn(
      "Stickers may not animated without libwebp on ffmpeg (--enable-ibwebp while compiling ffmpeg)"
    );
  if (!s.convert && !s.magick && !s.gm)
    conn.logger.warn(
      "Stickers may not work without imagemagick if libwebp on ffmpeg doesnt isntalled (pkg install imagemagick)"
    );
}

/* QuickTest */
_quickTest()
  .then(() => conn.logger.info("Quick Test Done"))
  .catch(console.error);
//FG - JB Made By 𝙁𝘾 么 Glitch Editz#0433
