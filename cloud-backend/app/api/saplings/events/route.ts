import { bindings, errorResponse, listEvents, optionsResponse, publicEvent, publicJson } from "@/lib/saplings-api";

export async function GET(request: Request) {
  try {
    const { db } = bindings();
    return publicJson(request, (await listEvents(db, true)).map(publicEvent));
  } catch (error) {
    return errorResponse(error, request);
  }
}

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}
