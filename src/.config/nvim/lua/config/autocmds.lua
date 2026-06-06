local function augroup(name)
    return vim.api.nvim_create_augroup("user_" .. name, { clear = true })
end

vim.api.nvim_create_autocmd("FileType", {
    group = augroup("prose_settings"),
    pattern = { "markdown", "text", "gitcommit" },
    callback = function(ev)
        vim.opt_local.wrap = true
        vim.opt_local.linebreak = true
        vim.opt_local.breakindent = true
        vim.opt_local.textwidth = 0

        local opts = { buffer = ev.buf, silent = true }
        vim.keymap.set({ "n", "v" }, "j", "gj", opts)
        vim.keymap.set({ "n", "v" }, "k", "gk", opts)
        vim.keymap.set({ "n", "v" }, "0", "g0", opts)
        vim.keymap.set({ "n", "v" }, "$", "g$", opts)
    end,
})
