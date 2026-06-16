import chromium from "@sparticuz/chromium";
import { chromium as coreBrowser } from "playwright-core";

export async function GET() {

    const executablePath = process.env.NODE_ENV === "production"
        ? await chromium.executablePath()
        : coreBrowser.executablePath();

    const browser = await coreBrowser.launch({
        args: [
            ...chromium.args,
            '--disable-blink-features=AutomationControlled',
            '--disable-web-resources'
        ],
        headless: true,
        executablePath,
        timeout: 30000
    });

    try {

        const page = await browser.newPage({
            timeout: 30000,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        // Mask automation
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        await page.goto(
            "https://qalam.nust.edu.pk/web/login",
            {
                waitUntil: "domcontentloaded",
                timeout: 60000
            }
        );

        // Wait for Cloudflare challenge to complete
        let currentUrl = page.url();
        if (currentUrl.includes("__cf_chl_rt_tk")) {
            console.log("Cloudflare challenge detected, waiting for completion...");
            await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
            currentUrl = page.url();
            console.log("After CF challenge:", currentUrl);
        }

        // Debug: Log page content to see what's actually there
        const pageTitle = await page.title();
        const pageUrl = page.url();
        const inputElements = await page.$$eval('input', inputs => inputs.map(inp => ({
            id: inp.id,
            name: inp.name,
            type: inp.type,
            placeholder: inp.placeholder
        }))).catch(() => []);

        console.log("Page loaded:", { pageTitle, pageUrl, inputElements });

        // Try multiple selectors for login field
        const loginSelectors = ['#login', 'input[name="login"]', 'input[name="username"]', 'input[type="text"]'];
        let loginField = null;
        
        for (const selector of loginSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                loginField = selector;
                break;
            } catch (e) {
                // Try next selector
            }
        }

        if (!loginField) {
            throw new Error(`Could not find login field. Available inputs: ${JSON.stringify(inputElements)}`);
        }

        // Fill credentials
        await page.fill(loginField, "nmushtaq.bscs24seecs", { timeout: 10000 });
        await page.fill('input[name="password"]', "Student@123", { timeout: 10000 });

        // Submit

        await page.click('button[type="submit"]', { timeout: 10000 });

        // Wait until redirected

        await page.waitForLoadState("networkidle", { timeout: 20000 });

        console.log(
            "Logged In URL:",
            page.url()
        );

        return Response.json({
            success: true,
            url: page.url()
        });

    } catch (err) {

        return Response.json({
            success: false,
            error: err.message
        });

    } finally {

        await browser.close();
    }
}
 