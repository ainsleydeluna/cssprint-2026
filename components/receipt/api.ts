// The receipt screens' only way to reach the server. Until the stub routes (#4) land these
// answer from temporary sample data; after that, each becomes a fetch to its route in app/api.
import { fakeAddStem, fakeDelete, fakeGet, fakeList, fakeSave, sampleExtract, sampleStems } from "./sample-data";
import type {
  DeleteReceiptResponse, ExtractReceiptResult, NewStem, ReceiptDetail, ReceiptListItem,
  SaveReceiptRequest, SaveReceiptResponse, Stem,
} from "./types";

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

export async function listReceipts(): Promise<ReceiptListItem[]> {
  await wait(300);
  return fakeList();
}

/** Resolves to null when the receipt doesn't exist (or isn't this shop's). */
export async function getReceipt(id: string): Promise<ReceiptDetail | null> {
  await wait(300);
  return fakeGet(id);
}

export async function deleteReceipt(id: string): Promise<DeleteReceiptResponse> {
  await wait(500);
  return fakeDelete(id);
}
