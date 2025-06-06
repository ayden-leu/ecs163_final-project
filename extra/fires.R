library(readr)
library(stringr)
library(dplyr)
library(lubridate)

setwd("C:/Users/leedo/Desktop/code/ecs163/") # Optional: set a new working directory


file_path <- "California_Fire_Perimeters_(all).csv"
fireDB <- read.csv(file_path)

# Remove fires before 2000
fireDB <- fireDB %>%
  filter(YEAR_ >= 2000)

# Filter rows where GIS_ACRES is at least 5000
fireDB <- fireDB %>%
  filter(GIS_ACRES >= 1000)

write.csv(fireDB, "FIRE_DB_1000PLUS_ACRES.csv", row.names = FALSE)

