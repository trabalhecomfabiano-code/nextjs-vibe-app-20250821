import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, fragmentId } = body;

    if (!projectId || !fragmentId) {
      return NextResponse.json(
        { error: "projectId and fragmentId are required" },
        { status: 400 }
      );
    }

    // Trigger da função Inngest de restauração
    const result = await inngest.send({
      name: "restore-commit/project",
      data: {
        projectId,
        fragmentId,
      },
    });

    return NextResponse.json({
      success: true,
      inngestEventId: result.ids[0],
      message: "Restauração iniciada. Aguarde...",
    });

  } catch (error) {
    console.error("Restore fragment API error:", error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Internal server error",
        success: false 
      },
      { status: 500 }
    );
  }
}