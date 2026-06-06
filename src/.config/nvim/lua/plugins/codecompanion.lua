return {
    {
        "olimorris/codecompanion.nvim",
        enabled = false,
        dependencies = {
            "nvim-lua/plenary.nvim",
            "nvim-treesitter/nvim-treesitter",
            "hrsh7th/nvim-cmp",
        },
        config = function()
            require("codecompanion").setup({
                adapters = {
                    acp = {
                        gemini_cli = function()
                            return require("codecompanion.adapters").extend("gemini_cli", {
                                defaults = {
                                    auth_method = "gemini-api-key",
                                    timeout = 30000,
                                    session_config_options = {
                                        model = "gemini-3.1-flash",
                                    },
                                },
                                env = {
                                    GEMINI_API_KEY = "GEMINI_API_KEY",
                                },
                            })
                        end,
                        opencode = function()
                            return require("codecompanion.adapters").extend("opencode", {
                                defaults = {
                                    timeout = 60000,
                                },
                            })
                        end,
                    },
                },
                interactions = {
                    chat = {
                        adapter = "opencode",
                    },
                    inline = {
                        adapter = "opencode",
                    },
                },
                display = {
                    action_palette = {
                        provider = "fzf_lua",
                    },
                },
            })
        end,
        keys = {
            { "<leader>ac", "<cmd>CodeCompanionChat Toggle<cr>", desc = "Toggle CodeCompanion Chat" },
            { "<leader>aa", "<cmd>CodeCompanionActions<cr>",     desc = "CodeCompanion Actions" },
            { "ga",         "<cmd>CodeCompanionChat Add<cr>",    mode = "v",                      desc = "Add Selection to Chat" },
        },
    },
}
