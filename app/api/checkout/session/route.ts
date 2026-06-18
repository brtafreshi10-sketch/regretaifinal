import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {});

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe secret key is not configured on the server." },
      { status: 500 }
    );
  }

  const body = await req.json();
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const successUrl = typeof body?.successUrl === "string" ? body.successUrl : "";
  const cancelUrl = typeof body?.cancelUrl === "string" ? body.cancelUrl : "";

  if (!email) {
    return NextResponse.json({ error: "Missing customer email." }, { status: 400 });
  }

  if (!successUrl || !cancelUrl) {
    return NextResponse.json({ error: "Missing redirect URLs." }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "RegretGPT Premium",
              description: "Unlimited regret analysis and premium history tools.",
            },
            recurring: { interval: "month" },
            unit_amount: 500,
          },
          quantity: 1,
        },
      ],
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        email,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Stripe checkout session error:", error);
    const message = error instanceof Error ? error.message : "Unable to create checkout session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
