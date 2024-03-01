Nanoc::Filter.define(:hidden) do |content, params|
  content.gsub(/hidden:(.+?)endhidden/m, "<div class=\"hidden\">\n\\1\n</div>")
end
