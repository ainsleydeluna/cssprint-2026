// The receipt screens' only way to reach the server. Until the stub routes (#4) land these
// answer from temporary sample data; after that, each becomes a fetch to its route in app/api.
import { fakeAddStem, fakeSave, sampleExtract, sampleStems } from "./sample-data";
import type { ExtractReceiptResult, NewStem, SaveReceiptRequest, SaveReceiptResponse, Stem } from "./types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function uploadPhoto(photo: File): Promise<{ photoPath: string }> {
  await wait(400);
  return { photoPath: `shop-sample/${photo.size}.jpg` };
}

export async function extractReceipt(photoPath: string): Promise<ExtractReceiptResult> {
  void photoPath;
  await wait(1200);
  return structuredClone(sampleExtract);
}

export async function listStems(): Promise<Stem[]> {
  return sampleStems.filter((s) => !s.hidden);
}

export async function addStem(input: NewStem): Promise<Stem> {
  await wait(300);
  return fakeAddStem(input);
}

export async function saveReceipt(req: SaveReceiptRequest): Promise<SaveReceiptResponse> {
  await wait(600);
  return fakeSave(req);
}
