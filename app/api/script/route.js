import chromium from "@sparticuz/chromium";
import { chromium as coreBrowser } from "playwright-core";

export async function GET() {

    const executablePath = process.env.NODE_ENV === "production"
        ? await chromium.executablePath()
        : coreBrowser.executablePath();

    const browser = await coreBrowser.launch({
        args: chromium.args,
        headless: true,
        executablePath,
        timeout: 30000
    });

    try {

        const page = await browser.newPage({
            timeout: 30000
        });

        await page.goto(
            "https://qalam.nust.edu.pk/web/login",
            {
                waitUntil: "domcontentloaded",
                timeout: 60000
            }
        );

        // Wait for login field to be visible before filling
        await page.waitForSelector("#login", { timeout: 30000 });
        
        // Fill credentials with a small delay
        await page.fill("#login", "nmushtaq.bscs24seecs", { timeout: 10000 });
        await page.fill("#password", "Student@123", { timeout: 10000 });

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
 