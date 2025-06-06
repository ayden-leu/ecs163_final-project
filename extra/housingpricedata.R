# Load necessary packages
# install.packages("readr") # if needed
# install.packages("dplyr") # if needed
library(readr)
library(dplyr)

# Define file path for house value
file_path <- "C:/Users/leedo/Desktop/code/ecs163/Neighborhood_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"

# Read the data
zhvi_data <- read_csv(file_path)

# Filter for California
california_data <- zhvi_data %>%
  filter(State == "CA")

california_data %>%
  select(-c(SizeRank, RegionType, StateName, State))


# Save the filtered Irvine metro area data to a CSV file
write_csv(california_data, "C:/Users/leedo/Desktop/code/ecs163/california_housing_data_zillow.csv")
