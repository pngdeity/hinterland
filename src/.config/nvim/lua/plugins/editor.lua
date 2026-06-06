return {
    {
        "nvim-treesitter/nvim-treesitter",
        event = "BufReadPost",
        build = ":TSUpdate",
        config = function()
            require("nvim-treesitter").setup({
                ensure_installed = { "lua", "vim", "vimdoc", "query", "c_sharp", "markdown", "markdown_inline", "python", "yaml", "bash", "dockerfile", "go", "gomod", "gowork", "rego", "hcl", "terraform", "typescript", "javascript", "json", "html" },
                auto_install = false,
            })
        end,
    },
    {
        "ibhagwan/fzf-lua",
        dependencies = { "nvim-tree/nvim-web-devicons" },
        config = function()
            require("fzf-lua").setup({})
        end,
        keys = {
            { "<leader>f", "<cmd>FzfLua files<cr>",     desc = "Find Files" },
            { "<leader>g", "<cmd>FzfLua live_grep<cr>", desc = "Live Grep" },
            { "<leader>b", "<cmd>FzfLua buffers<cr>",   desc = "Buffers" },
        },
    },
    {
        "m4xshen/hardtime.nvim",
        event = "BufReadPost",
        dependencies = { "MunifTanjim/nui.nvim" },
        opts = {
            disabled_filetypes = {
                markdown = true,
                text = true,
                gitcommit = true,
            },
        },
    },
}
