import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const supabaseAdmin = createAdminClient();
    const { id } = await params;

    const { email, password } = body;

    const { data, error } =
      await supabaseAdmin.auth.admin.updateUserById(id, {
        ...(email && { email }),
        ...(password && { password }),
      });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      user: data.user,
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Admin user API is working",
  });
}