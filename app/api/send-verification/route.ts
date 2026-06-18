import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    await resend.emails.send({
      from: "RegretGPT <brtafreshi2023@gmail.com>",
      to: email,
      subject: "Verify your RegretGPT account",
      html: `
        <h2>Verify your account</h2>
        <p>Your verification code is:</p>
        <h1>${code}</h1>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to send email." },
      { status: 500 }
    );
  }
}