import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IgebaClient, IgebaRequestError } from "../modules/online/igeba/igeba-client.js";

interface RecordedCall {
  url: string;
  method: string;
  body: string;
  range: string | null;
}

function createFakeFetch(handler: (call: RecordedCall) => Response): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const call: RecordedCall = {
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
      range: headers.get("range")
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const noSleep = async (): Promise<void> => {};

const searchPayload = {
  List: [
    {
      SongNumber: "20039643",
      SongName: "孤勇者",
      SingerName: "陈奕迅",
      Duration: "269",
      LanguageName: "国语",
      FileName: "220039643.mkv",
      MtvStyle: "Movie",
      MusicStyle: "原声",
      Feeling: "励志",
      VoiceChannel: "0"
    }
  ],
  Page: { PageCount: 26, RecordCount: 77 }
};

describe("IgebaClient", () => {
  it("maps search results into domain candidates", async () => {
    const { fetchImpl, calls } = createFakeFetch(() => Response.json(searchPayload));
    const client = new IgebaClient({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });

    const page = await client.search("孤勇者", { pageSize: 5 });

    expect(page.recordCount).toBe(77);
    expect(page.songs[0]).toMatchObject({
      songNumber: "20039643",
      title: "孤勇者",
      artistName: "陈奕迅",
      durationMs: 269000,
      fileName: "220039643.mkv"
    });
    expect(calls[0]?.url).toContain("/cloud.php");
    expect(calls[0]?.body).toContain("CMD=GET_SONGS");
  });

  it("loads package songs for ranks and playlists", async () => {
    const { fetchImpl, calls } = createFakeFetch(() => Response.json(searchPayload));
    const client = new IgebaClient({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });

    const page = await client.packageSongs({ packageType: 4, packageId: "13166", pageSize: 10 });

    expect(page.songs[0]?.songNumber).toBe("20039643");
    expect(calls[0]?.body).toContain("Package");
    expect(decodeURIComponent(calls[0]?.body ?? "")).toContain('"Type":4');
    expect(decodeURIComponent(calls[0]?.body ?? "")).toContain('"Id":"13166"');
  });

  it("loads singers, music styles, and songs by style", async () => {
    const { fetchImpl, calls } = createFakeFetch((call) => {
      const body = decodeURIComponent(call.body ?? "");
      if (body.includes("GET_PACGS")) {
        return Response.json({
          List: [{ SingerId: "1066", SingerName: "周杰伦", OtherName: "Jay", MidPicture: "http://x/1066.jpg" }],
          Page: { PageCount: 1, RecordCount: 42 }
        });
      }
      if (body.includes("GET_TAGS")) {
        return Response.json({ Tags: ["流行", "摇滚"] });
      }
      return Response.json(searchPayload);
    });
    const client = new IgebaClient({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });

    const singers = await client.singerList({ pageSize: 5 });
    const styles = await client.musicStyles();
    const songs = await client.songsByStyle("流行", { pageSize: 3 });

    expect(singers.singers[0]).toMatchObject({ singerId: "1066", singerName: "周杰伦" });
    expect(singers.recordCount).toBe(42);
    expect(styles).toEqual(["流行", "摇滚"]);
    expect(songs.songs[0]?.songNumber).toBe("20039643");
    expect(decodeURIComponent(calls[2]?.body ?? "")).toContain('"MusicStyle":"流行"');
  });

  it("maps hot modules and parses their app links", async () => {
    const { fetchImpl } = createFakeFetch(() =>
      Response.json({
        List: [
          {
            HeadId: "26",
            Title: "团建必点",
            SubTitle: "团队就是力量",
            Picture: "http://app.ige8.net/headlines/26.png",
            Link: "app://Object=Playlist&ObjectId=13166"
          }
        ]
      })
    );
    const client = new IgebaClient({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });

    const modules = await client.hotModules();

    expect(modules).toEqual([
      {
        headId: "26",
        title: "团建必点",
        subTitle: "团队就是力量",
        pictureUrl: "http://app.ige8.net/headlines/26.png",
        link: "app://Object=Playlist&ObjectId=13166",
        objectType: "Playlist",
        objectId: "13166"
      }
    ]);
  });

  it("retries resolve while the file node reports an expired rid", async () => {
    let probeCount = 0;
    const { fetchImpl, calls } = createFakeFetch((call) => {
      if (call.url.includes("/telnet.php")) {
        return Response.json({
          FileUrl: `http://file.local/g8file.php?path=/x.mkv&rid=${calls.length}`,
          FileName: "220039643.mkv",
          VoiceChannel: "0",
          Rights: { Code: 0 }
        });
      }
      probeCount += 1;
      if (probeCount === 1) {
        return new Response("Forbidden:Url Expired", { status: 403 });
      }
      return new Response("x", {
        status: 206,
        headers: { "content-range": "bytes 0-0/1024" }
      });
    });

    const client = new IgebaClient({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });
    const address = await client.resolveAddress("20039643", 5);

    expect(address.attempts).toBe(2);
    expect(address.sizeBytes).toBe(1024);
    expect(address.fileUrl).toContain("rid=");
  });

  it("marks rights-less songs as a permanent failure", async () => {
    const { fetchImpl } = createFakeFetch(() =>
      Response.json({ FileUrl: "", Rights: { Code: 3, Reason: "无权限" } })
    );
    const client = new IgebaClient({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });

    await expect(client.resolveAddress("20039643", 3)).rejects.toBeInstanceOf(IgebaRequestError);
  });

  it("downloads with closed ranges and stitches the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "igeba-client-"));
    try {
      const content = Buffer.from("0123456789");
      const { fetchImpl, calls } = createFakeFetch((call) => {
        const match = /^bytes=(\d+)-(\d+)$/u.exec(call.range ?? "");
        if (!match) {
          return new Response("Forbidden:Invalid Range", { status: 403 });
        }
        const start = Number.parseInt(match[1] ?? "0", 10);
        const end = Number.parseInt(match[2] ?? "0", 10);
        return new Response(content.subarray(start, end + 1), {
          status: 206,
          headers: { "content-range": `bytes ${start}-${end}/${content.length}` }
        });
      });

      const client = new IgebaClient({ fetchImpl, sleep: noSleep, minIntervalMs: 0 });
      const target = join(dir, "20039643.mkv");
      const result = await client.downloadToFile(
        {
          songNumber: "20039643",
          fileName: "220039643.mkv",
          fileUrl: "http://file.local/g8file.php?path=/x.mkv&rid=1",
          sizeBytes: content.length,
          voiceChannel: "0",
          rightsCode: 0,
          attempts: 1
        },
        target,
        { chunkSize: 4 }
      );

      expect(result.bytes).toBe(10);
      expect((await readFile(target)).toString()).toBe("0123456789");
      expect(calls.every((call) => call.range !== null)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
