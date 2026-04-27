import { EventSchemas, Inngest } from "inngest";
import { INNGEST_EVENT_SCHEMAS } from "./events";

// Create a client to send and receive events
export const inngest = new Inngest({
  id: "imaginate-dev",
  schemas: new EventSchemas().fromZod(INNGEST_EVENT_SCHEMAS),
});
