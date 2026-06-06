local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.uv.fs_stat(lazypath) then
    vim.fn.system({
        "git",
        "clone",
        "--filter=blob:none",
        "https://github.com/folke/lazy.nvim.git",
        "--branch=main",
        lazypath,
    })
end
vim.opt.rtp:prepend(lazypath)

require("config.options")
require("config.filetype")

require("lazy").setup("plugins", {
    checker = {
        enabled = true,
        notify = true,
        frequency = 604800,
    },
})

require("config.autocmds")
