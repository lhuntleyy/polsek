import { describe, expect, it } from "vitest";
import { audioLabel, buildMediaContent, isVoiceNoteMime } from "./media-content.js";
import { replyToGroupCommand } from "./group-reply.js";

const buf = Buffer.from("OggS....");

describe("buildMediaContent", () => {
  it("sends ogg voice notes as PTT with the opus codec mimetype WhatsApp requires", () => {
    expect(buildMediaContent("audio", buf, "audio/ogg")).toEqual({
      audio: buf,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true
    });
    expect(buildMediaContent("audio", buf, "audio/ogg; codecs=opus")).toMatchObject({ ptt: true });
    expect(buildMediaContent("audio", buf, "audio/opus")).toMatchObject({
      mimetype: "audio/ogg; codecs=opus",
      ptt: true
    });
  });

  it("sends other audio formats as regular audio files", () => {
    expect(buildMediaContent("audio", buf, "audio/mpeg")).toEqual({
      audio: buf,
      mimetype: "audio/mpeg",
      ptt: false
    });
    expect(buildMediaContent("audio", buf, "audio/mp4")).toMatchObject({ ptt: false });
  });

  it("keeps captions on images and videos", () => {
    expect(buildMediaContent("image", buf, "image/jpeg", "Lampiran #A")).toEqual({
      image: buf,
      mimetype: "image/jpeg",
      caption: "Lampiran #A"
    });
    expect(buildMediaContent("video", buf, "video/mp4", "Lampiran #B")).toEqual({
      video: buf,
      mimetype: "video/mp4",
      caption: "Lampiran #B"
    });
  });
});

describe("isVoiceNoteMime", () => {
  it("detects ogg/opus regardless of parameters or case", () => {
    expect(isVoiceNoteMime("Audio/OGG; codecs=opus")).toBe(true);
    expect(isVoiceNoteMime("audio/mpeg")).toBe(false);
  });
});

describe("audioLabel", () => {
  it("labels the voice note with the ticket caption so the group can reply to it", () => {
    const label = audioLabel("Lampiran #TELUKNAGA-261125-003 (1/2)");
    expect(label).toBe("🎙️ Voice note · Lampiran #TELUKNAGA-261125-003 (1/2)");
    expect(replyToGroupCommand("otw", label ?? undefined)).toBe("/otw TELUKNAGA-261125-003");
  });

  it("returns null without a caption", () => {
    expect(audioLabel(undefined)).toBeNull();
    expect(audioLabel("  ")).toBeNull();
  });
});
