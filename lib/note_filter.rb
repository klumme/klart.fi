Nanoc::Filter.define(:note) do |content, params|
  content.gsub(/note:(.+?)endnote/m, "<div class=\"note\">\n\\1\n</div>")
end
