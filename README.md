# Plant watch

Read-only board for the Deye Cloud plants on `home.jcalatrava@gmail.com` in the `eu` data center.

The server calls the hosted Deye Open MCP at `https://developer.deyecloud.com/openmcp/mcp`. It logs in, lists stations, then reads latest power, devices, the last day of station alarms, and today’s generation. It does not call control tools, and it does not create plants.

When `DEYE_APP_ID`, `DEYE_APP_SECRET`, or `DEYE_ACCOUNT_PASSWORD` is missing, the board shows labeled sample plants. It never invents those values.

```bash
npm install
npm test
npm run dev
```

The dev server listens on `http://127.0.0.1:43123`.
