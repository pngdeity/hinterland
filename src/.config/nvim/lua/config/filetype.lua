vim.filetype.add({
  extension = {
    pkl = "pkl",
    pcf = "pcf",
    razor = "razor",
    cshtml = "razor",
    slnx = "slnx",
  },
  filename = {
    PKGBUILD = "sh",
    Justfile = "just",
    justfile = "just",
  },
  pattern = {
    [".*%.dockerfile"] = "dockerfile",
  },
})
