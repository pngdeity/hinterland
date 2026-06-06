return {
    {
        "williamboman/mason.nvim",
        lazy = false,
        config = function()
            require("mason").setup({
                PATH = "append",
                registries = {
                    "github:mason-org/mason-registry",
                    "github:Crashdummyy/mason-registry",
                },
            })
        end,
    },
    {
        "mason-org/mason-lspconfig.nvim",
        lazy = false,
        dependencies = {
            "williamboman/mason.nvim",
            "neovim/nvim-lspconfig",
            "hrsh7th/cmp-nvim-lsp",
        },
        config = function()
            local ok, cmp_nvim_lsp = pcall(require, "cmp_nvim_lsp")
            local capabilities = ok and cmp_nvim_lsp.default_capabilities() or {}

            vim.lsp.config("*", {
                capabilities = capabilities,
            })

            vim.lsp.config("lua_ls", {
                settings = {
                    Lua = {
                        runtime = { version = "LuaJIT" },
                        workspace = {
                            checkThirdParty = false,
                            library = vim.api.nvim_get_runtime_file("", true),
                        },
                        diagnostics = {
                            globals = { "vim" },
                        },
                    },
                },
            })

            vim.lsp.config("yamlls", {
                settings = {
                    yaml = {
                        schemaStore = { enable = true },
                        keyOrdering = true,
                        schemas = {
                            ["https://raw.githubusercontent.com/pngdeity/apm-user-repository/main/schemas/apm.json"] = "**/apm.yml",
                        },
                    },
                },
            })

            vim.lsp.config("bashls", {
                filetypes = { "sh", "bash", "zsh", "ksh", "make" },
                settings = {
                    bashIde = {
                        shfmt = {
                            languageDialect = "bash",
                        },
                    },
                },
            })

            vim.lsp.config("terraformls", {
                settings = {
                    terraform = {
                        path = "/usr/bin/tofu",
                    },
                    experimentalFeatures = {
                        prefillRequiredFields = true,
                    },
                },
            })

            vim.lsp.config("html", {
                filetypes = { "html" },
            })

            vim.lsp.config("pkl", {
                cmd = { "pkl-lsp" },
                filetypes = { "pkl", "pcf" },
                root_markers = { ".git" },
            })
            vim.lsp.enable("pkl")

            local needs_mason = {}
            for _, server in ipairs({
                "bashls",
                "dockerls",
                "fsautocomplete",
                "gopls",
                "html",
                "just",
                "lua_ls",
                "pyright",
                "regal",
                "rumdl",
                "taplo",
                "terraformls",
                "ts_ls",
                "yamlls",
            }) do
                local cfg = vim.lsp.config[server]
                local cmd = cfg and cfg.cmd
                if type(cmd) == "table" and cmd[1] and vim.fn.executable(cmd[1]) == 1 then
                    vim.lsp.enable(server)
                else
                    table.insert(needs_mason, server)
                end
            end

            require("mason-lspconfig").setup({
                ensure_installed = needs_mason,
            })

            vim.api.nvim_create_autocmd("LspAttach", {
                group = vim.api.nvim_create_augroup("UserLspConfig", { clear = true }),
                callback = function(ev)
                    local opts = { buffer = ev.buf }
                    vim.keymap.set("n", "gd", vim.lsp.buf.definition, opts)
                    vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
                    vim.keymap.set("n", "<leader>rn", vim.lsp.buf.rename, opts)
                    vim.keymap.set({ "n", "v" }, "<leader>ca", vim.lsp.buf.code_action, opts)
                    vim.keymap.set("n", "gr", vim.lsp.buf.references, opts)

                    local ls = require("luasnip")
                    vim.keymap.set({ "i", "s" }, "<C-l>", function()
                        if ls.expand_or_jumpable() then
                            ls.expand_or_jump()
                        end
                    end, { silent = true, buffer = ev.buf })

                    vim.keymap.set({ "i", "s" }, "<C-j>", function()
                        if ls.jumpable(-1) then
                            ls.jump(-1)
                        end
                    end, { silent = true, buffer = ev.buf })
                end,
            })
        end,
    },
}
