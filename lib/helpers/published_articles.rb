module PublishedArticlesHelper
  def published_articles
    sorted_articles.delete_if { |a| a[:status] == "draft" }
  end
end
