import { handleTokenRequest } from "../../../../lib/gemini/issue-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function respond(request: Request): Promise<Response> {
  return handleTokenRequest(request);
}

export function GET(request: Request) {
  return respond(request);
}

export function POST(request: Request) {
  return respond(request);
}

export function PUT(request: Request) {
  return respond(request);
}

export function PATCH(request: Request) {
  return respond(request);
}

export function DELETE(request: Request) {
  return respond(request);
}
