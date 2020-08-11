const { send, text } = require("micro");
const { router, post } = require("microrouter");
const assert = require("assert");
const parse = require("urlencoded-body-parser");
const got = require("got");
const twilio = require("twilio");

process.env.NODE_ENV !== "production" && require("dotenv").config();

const {
  SLACK_TOKEN,
  SLACK_USER_ID,
  TWILIO_AUTH_TOKEN,
  TWILIO_REQUEST_URL,
} = process.env;
assert(SLACK_TOKEN);
assert(SLACK_USER_ID);
assert(TWILIO_AUTH_TOKEN);
assert(TWILIO_REQUEST_URL);

const instance = got.extend({
  prefixUrl: "https://slack.com/api/",
  headers: {
    "Content-type": "application/json",
    Authorization: `Bearer ${SLACK_TOKEN}`,
  },
});

async function mustValidateTwilioSignature(req) {
  const { headers } = req;
  const signature = headers["x-twilio-signature"];

  const request = await parse(req);

  const valid = twilio.validateRequest(
    TWILIO_AUTH_TOKEN,
    signature,
    TWILIO_REQUEST_URL,
    request
  );

  if (!valid) throw new Error("Invalid signature");
}

const postSMS = async (req, res) => {
  await mustValidateTwilioSignature(req);

  const { From: from, Body: body } = await parse(req);

  const name = from.replace(/\W/g, "");

  const { channels } = await instance.get("conversations.list").json();

  const channelExists = channels.some((c) => c.name === name);
  if (!channelExists) {
    const { channel } = await instance
      .post("conversations.create", {
        json: { name },
      })
      .json();

    await instance.post("conversations.invite", {
      json: {
        channel: channel.id,
        users: SLACK_USER_ID,
      },
    });
  }

  await instance.post("chat.postMessage", {
    json: {
      channel: name,
      username: from,
      icon_emoji: ":mailbox:",
      text: body,
    },
  });

  send(res, 200);
};

module.exports = router(post("/sms", postSMS));
