import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {});

export async function GET(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { success: false, error: "Stripe secret key is not configured on the server." },
      { status: 500 }
    );
  }

  const sessionId = req.nextUrl.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json({ success: false, error: "Missing session_id." }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    if (session.mode !== "subscription") {
      return NextResponse.json({ success: false, error: "Invalid checkout mode." }, { status: 400 });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({ success: false, error: "Payment was not completed." }, { status: 402 });
    }

    const customerEmail = session.customer_email || session.customer_details?.email;
    if (!customerEmail) {
      return NextResponse.json({ success: false, error: "Customer email is missing from checkout session." }, { status: 400 });
    }

    return NextResponse.json({ success: true, customer_email: customerEmail });
  } catch (error: unknown) {
    console.error("Stripe verify session error:", error);
    const message = error instanceof Error ? error.message : "Unable to verify checkout session.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
