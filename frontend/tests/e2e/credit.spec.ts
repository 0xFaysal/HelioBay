import { test, expect, type Page } from "@playwright/test";
import type { Snapshot } from "../../lib/credit/model";
test.skip(process.env.TEST_APP_MODE === "api", "Demo journeys run against the demo server.");
async function login(page:Page, admin=false){
  await page.goto(`/auth/sign-in${admin?"?role=admin":""}`);
  await page.getByRole("button",{name:admin?"Continue as Demo Admin":"Continue in Demo Mode",exact:true}).click();
  await expect(page.getByRole("heading",{name:admin?"A clearer view of the network.":"A brighter day, Alex."})).toBeVisible();
}
const state=(page:Page):Promise<Snapshot>=>page.evaluate(()=>JSON.parse(localStorage.getItem("heliobay-credit-v3")!).state.data);
async function confirm(page:Page){await page.getByRole("alertdialog").getByRole("button",{name:"Confirm",exact:true}).click();await expect(page.getByRole("alertdialog")).toHaveCount(0);}
async function connect(page:Page){await page.goto("/charge");await expect(page.getByRole("button",{name:"Start Charging",exact:true})).toBeDisabled();await page.getByRole("button",{name:"Simulate plug connect",exact:true}).click();await expect(page.getByText("Plug detected",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Start Charging",exact:true}).click();await expect(page).toHaveURL(/\/charging\/SES-/);}
async function topup(page:Page,amount="10.01"){
  await page.goto("/wallet/top-up");await page.getByLabel("Custom amount (Credits)").fill(amount);
  await page.getByRole("button",{name:"Review top-up"}).click();await expect(page.getByRole("dialog")).toContainText(`৳${amount}`);
  await page.getByRole("button",{name:"Continue to SSLCOMMERZ Sandbox",exact:true}).click();await expect(page).toHaveURL(/\/wallet\/sandbox\/TOP-/);
}

test("credit smoke: public site, owner and admin render without browser errors",async({page,context})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto("/");await expect(page.getByRole("heading",{level:1})).toContainText("Clean energy.");await page.screenshot({path:"artifacts/credit-home-1440.png",fullPage:true});
  await login(page);for(const route of ["/dashboard","/wallet","/charge"]){await page.goto(route);await expect(page.getByRole("heading",{level:1})).toBeVisible();await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);await page.screenshot({path:`artifacts/credit-${route.slice(1)}-1440.png`,fullPage:true});}
  const admin=await context.newPage();await login(admin,true);await expect(admin.getByRole("heading",{level:1})).toBeVisible();await admin.screenshot({path:"artifacts/credit-admin-1440.png",fullPage:true});expect(errors).toEqual([]);
});

test("top-up validation, verified payment, duplicate callback and persistence",async({page})=>{
  await login(page);await page.goto("/wallet/top-up");
  for(const value of ["9.99","10.001","5000.01"]){await page.getByLabel("Custom amount (Credits)").fill(value);await page.getByRole("button",{name:"Review top-up"}).click();await expect(page.getByRole("main").getByRole("alert")).toBeVisible();await expect(page.getByRole("dialog")).toHaveCount(0);}
  await topup(page);expect((await state(page)).wallets[0].balanceMinor).toBe(50000);
  await page.getByRole("button",{name:"Simulate successful payment"}).click();await expect(page.getByRole("heading",{name:"Verifying payment."})).toBeVisible();await expect(page.getByRole("heading",{name:"Credits, ready to go."})).toBeVisible();const callback=page.url();
  expect((await state(page)).wallets[0].balanceMinor).toBe(51001);await page.reload();await expect(page.getByRole("heading",{name:"Credits, ready to go."})).toBeVisible();await page.goto(callback);expect((await state(page)).ledger.filter(l=>l.kind==="top-up")).toHaveLength(1);
  await page.goto("/wallet");await expect(page.getByTestId("wallet-balance")).toHaveText("510.01 Credits");
});

test("pending, failed and cancelled callbacks never add credit",async({page})=>{
  await login(page);
  for(const [button,title] of [["Simulate pending verification","Verifying payment."],["Simulate payment failure","Payment not completed."],["Cancel sandbox payment","Payment cancelled."]]){
    await topup(page,"10.00");await page.getByRole("button",{name:button,exact:true}).click();await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();expect((await state(page)).wallets[0].balanceMinor).toBe(50000);
  }
  await page.goto("/payment/success?paymentId=forged-callback");await expect(page.getByRole("main").getByRole("alert")).toContainText("not found");expect((await state(page)).wallets[0].balanceMinor).toBe(50000);
});

test("direct bay selection requires plug, waits for ACK, consumes credit and stops manually",async({page})=>{
  await login(page);await page.goto("/charge");await page.getByLabel("Charging bay").selectOption("green-point-BAY02");await expect(page.getByRole("button",{name:"Start Charging",exact:true})).toBeDisabled();await page.getByRole("button",{name:"Simulate plug connect"}).click();await page.getByRole("button",{name:"Start Charging",exact:true}).click();await expect(page).toHaveURL(/\/charging\/SES-/);
  await expect(page.getByText("START requested; credits reserved. Waiting for device acknowledgement.",{exact:false})).toBeVisible();await expect.poll(async()=> (await state(page)).sessions[0].state).toBe("charging");await expect.poll(async()=> (await state(page)).sessions[0].costMinor).toBeGreaterThan(0);
  await page.getByRole("button",{name:"Stop Charging",exact:true}).click();await confirm(page);await expect(page.getByRole("heading",{name:"Charging receipt",exact:true})).toBeVisible();await expect(page.getByText("USER_STOPPED",{exact:true})).toBeVisible();const result=await state(page);expect(result.ledger.filter(l=>l.kind==="charging-debit")).toHaveLength(1);expect(result.sessions[0].bayId).toBe("green-point-BAY02");await page.reload();await expect(page.getByText("USER_STOPPED",{exact:true})).toBeVisible();
});

test("shared admin adjustments, blocking, low-credit exhaustion and insufficient credit",async({page,context})=>{
  await login(page);const admin=await context.newPage();await login(admin,true);await admin.goto("/admin/users/demo-owner");
  await admin.getByLabel("Amount (Credits)",{exact:true}).fill("499.99");await admin.getByLabel("Direction",{exact:true}).selectOption("debit");await admin.getByRole("button",{name:"Apply credit adjustment"}).click();await admin.getByRole("alertdialog").getByRole("button",{name:"Confirm",exact:true}).click();await expect(admin.getByRole("alertdialog")).toContainText("reason");await admin.getByRole("button",{name:"Keep current state"}).click();
  await admin.getByLabel("Mandatory adjustment reason").fill("Controlled exhaustion test");await admin.getByRole("button",{name:"Apply credit adjustment"}).click();await confirm(admin);await expect.poll(async()=> (await state(page)).wallets[0].balanceMinor).toBe(1);
  await admin.getByLabel("Account status reason").fill("Account safety review");await admin.getByRole("button",{name:"Block user",exact:true}).click();await confirm(admin);await expect(page.getByRole("heading",{name:"Your account is blocked."})).toBeVisible();await admin.getByRole("button",{name:"Activate user",exact:true}).click();await confirm(admin);await expect(page.getByRole("heading",{name:"A brighter day, Alex."})).toBeVisible();
  await connect(page);await expect(page.getByText("CREDIT_EXHAUSTED",{exact:true})).toBeVisible();expect((await state(page)).wallets[0].balanceMinor).toBe(0);await page.goto("/charge");await expect(page.getByRole("button",{name:"Start Charging",exact:true})).toBeDisabled();await expect(page.getByRole("link",{name:"Add Credits",exact:true})).toBeVisible();
});

test("device scenarios cover START failure, timeout retry, unplug and full battery",async({page,context})=>{
  test.setTimeout(120000);await login(page);const admin=await context.newPage();await login(admin,true);await admin.goto("/admin/devices");
  await admin.getByLabel("Next command outcome").selectOption("failure");await connect(page);await expect(page.getByRole("heading",{name:"Charging receipt"})).toBeVisible();expect((await state(page)).commands[0].status).toBe("failed");expect((await state(page)).wallets[0].balanceMinor).toBe(50000);
  await admin.getByLabel("Next command outcome").selectOption("timeout");await page.goto("/charge");await page.getByRole("button",{name:"Start Charging",exact:true}).click();await expect.poll(async()=> (await state(page)).commands[0].status).toBe("timed-out");await expect(page.getByRole("link",{name:"Return to Connect and Start"})).toBeVisible();
  await admin.getByLabel("Next command outcome").selectOption("success");await page.goto("/charge");await page.getByRole("button",{name:"Start Charging",exact:true}).click();await expect.poll(async()=> (await state(page)).sessions[0].state).toBe("charging");await page.getByRole("button",{name:"Simulate plug disconnect",exact:true}).click();await expect(page.getByText("PLUG_DISCONNECTED",{exact:true})).toBeVisible();
  await connect(page);await expect.poll(async()=> (await state(page)).sessions[0].state).toBe("charging");await admin.getByRole("button",{name:"Simulate full battery",exact:true}).click();await expect(page.getByText("BATTERY_FULL",{exact:true})).toBeVisible();
});

for(const [code,label] of [[1,"permission denied"],[2,"could not be determined"],[3,"timed out"]] as const){test(`location error ${code} has a usable manual fallback`,async({page})=>{
  await page.addInitScript(code=>Object.defineProperty(navigator,"geolocation",{configurable:true,value:{getCurrentPosition:(_ok:unknown,fail:(e:{code:number})=>void)=>fail({code})}}),code);
  await page.goto("/stations");await page.getByRole("button",{name:"Use my location"}).click();await expect(page.getByRole("main").getByRole("alert")).toContainText(label);await page.getByLabel("Manual location search").fill("Banani");await page.getByRole("button",{name:"Search area"}).click();await expect(page.locator(".station-card").first()).toContainText("Banani");await expect(page.locator(".station-card").first()).toContainText("0.0 km");
});}

test("location granted, saved filters and map marker selection remain usable without tiles",async({page,context})=>{
  await context.grantPermissions(["geolocation"]);await context.setGeolocation({latitude:23.7946,longitude:90.4012});await page.route("https://*.tile.openstreetmap.org/**",r=>r.abort());await login(page);await page.goto("/stations");await page.getByRole("button",{name:"Use my location"}).click();await expect(page.getByText("Your current location",{exact:true})).toBeVisible();await expect(page.locator(".station-card").first()).toContainText("Banani");
  await page.getByRole("button",{name:"Save HelioBay Banani Grove",exact:true}).click();await page.getByLabel("Search stations").fill("Banani");await page.getByLabel("Station filter").selectOption("saved");await expect(page.locator(".station-card")).toHaveCount(1);await page.getByRole("button",{name:"Map view",exact:true}).click();await expect(page.locator(".leaflet-container")).toBeVisible();await expect(page.getByText("Map tiles are unavailable.",{exact:false})).toBeVisible();await page.getByRole("button",{name:"Show on map",exact:true}).click();await expect(page.locator(".station-card.selected")).toContainText("Banani");
  await page.getByLabel("Search stations").fill("not-a-station");await expect(page.getByRole("heading",{name:"No stations match your search."})).toBeVisible();await page.getByRole("button",{name:"Clear filters"}).click();await expect(page.locator(".station-card")).toHaveCount(5);
});

test("active routes have no booking controls and fit all target widths",async({page,context})=>{
  test.setTimeout(240000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await login(page);
  const ownerRoutes=["/","/stations","/stations/green-point","/dashboard","/wallet","/wallet/top-up","/wallet/transactions","/charge","/history","/vehicles","/profile","/how-it-works","/pricing","/sustainability","/privacy","/terms"];
  for(const route of ownerRoutes){await page.goto(route);await expect(page.getByRole("heading",{level:1})).toBeVisible();await expect(page.locator('a[href*="bookings"],a[href*="refunds"]')).toHaveCount(0);await expect(page.getByRole("button",{name:/Book a Slot|Continue to payment/})).toHaveCount(0);}
  for(const width of [390,768,1024,1440]){await page.setViewportSize({width,height:1000});for(const route of ["/dashboard","/stations/green-point","/wallet","/wallet/top-up","/wallet/transactions","/charge"]){await page.goto(route);await expect(page.getByRole("heading",{level:1})).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===390)await page.screenshot({path:`artifacts/credit-${route.replaceAll("/","-")}-${width}.png`,fullPage:true});}if(width===390){await page.getByRole("navigation",{name:"Mobile quick navigation"}).getByRole("link",{name:"Wallet",exact:true}).click();await expect(page).toHaveURL(/\/wallet$/);}}
  const admin=await context.newPage();await login(admin,true);for(const width of [390,1440]){await admin.setViewportSize({width,height:1000});for(const route of ["/admin","/admin/users","/admin/users/demo-owner","/admin/stations","/admin/stations/green-point","/admin/bays","/admin/devices","/admin/sessions","/admin/wallet-transactions","/admin/payments","/admin/analytics","/admin/faults","/admin/settings"]){await admin.goto(route);await expect(admin.getByRole("heading",{level:1})).toBeVisible();await expect.poll(()=>admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}expect(errors).toEqual([]);
});
