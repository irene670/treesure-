import { bindings, errorResponse, findEvent, optionsResponse, publicEvent, publicJson } from "@/lib/saplings-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { db } = bindings();
    const event = await findEvent(db, id, true);
    if (!event) return publicJson(request, { error: "找不到這場樹苗活動" }, { status: 404 });
    return publicJson(request, publicEvent(event));
  } catch (error) {
    return errorResponse(error, request);
  }
}

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}
