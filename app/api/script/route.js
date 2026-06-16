import { chromium as localChromium } from "playwright";
import vercelChromium from "@sparticuz/chromium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LOGIN_URL = process.env.QALAM_LOGIN_URL ?? "https://qalam.nust.edu.pk/web/login";
const GRADEBOOK_URL =
    process.env.QALAM_GRADEBOOK_URL ??
    "https://qalam.nust.edu.pk/student/course/gradebook/2146734";
const LOGIN_VALUE = process.env.QALAM_LOGIN ?? "nmushtaq.bscs24seecs";
const PASSWORD_VALUE = process.env.QALAM_PASSWORD ?? "Student@123";
const DEFAULT_TIMEOUT = 300000;

function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toNumber(value) {
    const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));

    return Number.isNaN(parsed) ? null : parsed;
}

function getProxyConfig() {
    const proxyServer = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? process.env.ALL_PROXY;

    if (!proxyServer) {
        return undefined;
    }

    return {
        server: proxyServer
    };
}

async function launchBrowser() {
    const proxy = getProxyConfig();

    if (process.env.VERCEL) {
        const executablePath = await vercelChromium.executablePath();

        return localChromium.launch({
            args: vercelChromium.args,
            defaultViewport: vercelChromium.defaultViewport,
            executablePath,
            headless: false,
            ignoreHTTPSErrors: true,
            proxy
        });
    }

    return localChromium.launch({
        headless: true,
        executablePath: localChromium.executablePath(),
        ignoreHTTPSErrors: true,
        proxy
    });
}

async function findSelector(page, selectors) {
    for (const selector of selectors) {
        try {
            await page.locator(selector).first().waitFor({
                state: "visible",
                timeout: DEFAULT_TIMEOUT
            });

            return selector;
        } catch (error) {
            // Keep trying the next selector.
        }
    }

    throw new Error(`Could not find any matching selector: ${selectors.join(", ")}`);
}

async function extractGradebook(page) {
    return page.locator("table.table_tree tbody > tr").evaluateAll((rows) => {
        const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
        const toNum = (value) => {
            const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));

            return Number.isNaN(parsed) ? null : parsed;
        };

        const categories = [];
        let currentCategory = null;
        let inChildRows = false;

        for (const row of rows) {
            if (row.classList.contains("table-parent-row")) {
                const link = row.querySelector("a.toggle-childrens");
                const title = clean(link?.childNodes?.[0]?.textContent || link?.textContent || "");
                const badge = clean(row.querySelector(".uk-badge")?.textContent || "");
                const metrics = Array.from(row.querySelectorAll(".qh-category-metrics strong")).map((node) =>
                    clean(node.textContent || "")
                );

                currentCategory = {
                    name: title,
                    weight: toNum(badge),
                    obtainedPercentage: null,
                    classAverage: metrics[0] ? toNum(metrics[0]) : null,
                    differenceFromClass: metrics[1] ? toNum(metrics[1]) : null,
                    assessments: []
                };

                const cells = row.querySelectorAll("td");
                if (cells[1]) {
                    currentCategory.obtainedPercentage = toNum(clean(cells[1].textContent || ""));
                }

                categories.push(currentCategory);
                inChildRows = false;
                continue;
            }

            if (!currentCategory) {
                continue;
            }

            if (row.querySelector("th") && row.classList.contains("table-child-row")) {
                inChildRows = true;
                continue;
            }

            if (!inChildRows) {
                continue;
            }

            const cells = Array.from(row.querySelectorAll("td"));

            if (cells.length < 5) {
                continue;
            }

            currentCategory.assessments.push({
                name: clean(cells[0].textContent || ""),
                maxMark: toNum(clean(cells[1].textContent || "")),
                obtainedMarks: toNum(clean(cells[2].textContent || "")),
                classAverage: toNum(clean(cells[3].textContent || "")),
                percentage: toNum(clean(cells[4].textContent || ""))
            });
        }

        return categories;
    });
}

async function extractSummary(page) {
    try {
        return await page.locator(".qh-totals-summary").evaluate((node) => {
            const text = String(node.textContent ?? "").replace(/\s+/g, " ").trim();
            const matches = text.match(/-?\d+(?:\.\d+)?%/g) || [];
            const toNum = (value) => {
                const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));

                return Number.isNaN(parsed) ? null : parsed;
            };

            return {
                overallAbsolutes: matches[0] ? toNum(matches[0]) : null,
                classAverage: matches[1] ? toNum(matches[1]) : null,
                differenceFromClass: matches[2] ? toNum(matches[2]) : null
            };
        });
    } catch (error) {
        return {
            overallAbsolutes: null,
            classAverage: null,
            differenceFromClass: null
        };
    }
}

export async function GET() {
    let page = null;
    let browser = null;
    let stage = "launch";

    try {
        browser = await launchBrowser();
        page = await browser.newPage();

        page.setDefaultTimeout(DEFAULT_TIMEOUT);
        page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);

        stage = "login page";
        await page.goto(LOGIN_URL, {
            waitUntil: "domcontentloaded",
            timeout: DEFAULT_TIMEOUT
        });

        stage = "find login form";
        const loginSelector = await findSelector(page, [
            "#login",
            "input[name='login']",
            "input[name='username']",
            "input[type='text']",
            "input[type='email']"
        ]);
        const passwordSelector = await findSelector(page, [
            "#password",
            "input[name='password']",
            "input[type='password']"
        ]);

        stage = "fill credentials";
        await page.fill(loginSelector, LOGIN_VALUE, { timeout: DEFAULT_TIMEOUT });
        await page.fill(passwordSelector, PASSWORD_VALUE, { timeout: DEFAULT_TIMEOUT });

        stage = "submit login";
        await Promise.all([
            page.click("button[type='submit']", { timeout: DEFAULT_TIMEOUT }),
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT }).catch(() => null)
        ]);

        stage = "gradebook page";
        await page.goto(GRADEBOOK_URL, {
            waitUntil: "domcontentloaded",
            timeout: DEFAULT_TIMEOUT
        });

        stage = "wait for gradebook";
        await page.waitForSelector("table.table_tree tbody > tr.table-parent-row", {
            timeout: DEFAULT_TIMEOUT
        });

        const courseTitle = normalizeText(
            await page.locator(".md-card-content .uk-tab li.uk-active a").first().textContent().catch(() => "")
        );

        const summary = await extractSummary(page);
        const gradebook = await extractGradebook(page);

        return Response.json({
            success: true,
            courseTitle,
            url: page.url(),
            summary,
            gradebook
        });
    } catch (error) {
        return Response.json(
            {
                success: false,
                stage,
                url: page?.url?.() ?? null,
                error: error instanceof Error ? error.message : String(error)
            },
            { status: 500 }
        );
    } finally {
        if (page) {
            await page.close().catch(() => null);
        }

        if (browser) {
            await browser.close().catch(() => null);
        }
    }
}