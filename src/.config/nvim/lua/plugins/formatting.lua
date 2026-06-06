return {
    {
        "stevearc/conform.nvim",
        event = { "BufWritePre" },
        cmd = { "ConformInfo" },
        keys = {
            {
                "<leader>cf",
                function()
                    require("conform").format({ async = true, lsp_format = "fallback" })
                end,
                mode = { "n", "v" },
                desc = "Format",
            },
            {
                "<leader>uf",
                function()
                    vim.g.disable_autoformat = not vim.g.disable_autoformat
                    vim.notify("Autoformat " .. (vim.g.disable_autoformat and "OFF" or "ON"))
                end,
                mode = "n",
                desc = "Toggle autoformat",
            },
        },
        init = function()
            vim.o.formatexpr = "v:lua.require'conform'.formatexpr()"
        end,
        opts = {
            formatters_by_ft = {
                lua = { "stylua" },
                cs = { "csharpier" },
                sh = { "shfmt" },
                bash = { "shfmt" },
                zsh = { "shfmt" },
                go = { "gofmt" },
                terraform = { "tofu" },
                python = { "ruff_format" },
                javascript = { "deno_fmt" },
                typescript = { "deno_fmt" },
                javascriptreact = { "deno_fmt" },
                typescriptreact = { "deno_fmt" },
                json = { "deno_fmt" },
                jsonc = { "deno_fmt" },
                html = { "deno_fmt" },
                css = { "deno_fmt" },
                scss = { "deno_fmt" },
                sass = { "deno_fmt" },
                less = { "deno_fmt" },
                sql = { "deno_fmt" },
                markdown = { "rumdl" },
                yaml = { "yamlfmt" },
                rego = { "regal_fix" },
                pkl = { "pkl_fmt" },
                toml = { "taplo" },
                fsharp = { "fantomas" },
                xml = { "xmllint" },
                slnx = { "xmllint" },
            },
            formatters = {
                deno_fmt = {
                    command = "deno",
                    args = { "fmt", "--unstable-css", "--unstable-sql", "--unstable-html", "$FILENAME" },
                    stdin = false,
                },
                yamlfmt = {
                    command = "yamlfmt",
                    args = { "$FILENAME" },
                    stdin = false,
                },
                rumdl = {
                    command = "rumdl",
                    args = {
                        "fmt",
                        "--fixable",
                        "MD009,MD010,MD012,MD018,MD019,MD020,MD021,MD037,MD038,MD039,MD047,MD048,MD049,MD050,MD055,MD064",
                        "$FILENAME",
                    },
                    stdin = false,
                },
                tofu = {
                    command = "tofu",
                    args = { "fmt", "$FILENAME" },
                    stdin = false,
                },
                regal_fix = {
                    command = "regal",
                    args = { "fix", "$FILENAME" },
                    stdin = false,
                },
                pkl_fmt = {
                    command = "pkl",
                    args = { "format", "-w", "$FILENAME" },
                    stdin = false,
                },
                xmllint = {
                    command = "xmllint",
                    args = { "--format", "--output", "$FILENAME", "$FILENAME" },
                    stdin = false,
                },
                taplo = {
                    command = "taplo",
                    args = { "fmt", "$FILENAME" },
                    stdin = false,
                },
                fantomas = {
                    command = "fantomas",
                    args = { "$FILENAME" },
                    stdin = false,
                },
            },
            default_format_opts = {
                lsp_format = "fallback",
            },
            format_on_save = function(bufnr)
                if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
                    return
                end
                return { timeout_ms = 500, lsp_format = "fallback" }
            end,
        },
    },
}
