'use strict';

const h = require('../helpers.js');
const Page = require('./page').Page;
const CatalogPage = require('./catalog').CatalogPage;

class CreateProjectPage extends Page {
  constructor(project, menu) {
    super(project, menu);
  }
  getUrl() {
    return 'create-project';
  }
  enterProjectInfo() {
    h.setInputValue('name', this.project.name);
    h.setInputValue('displayName', this.project.displayName);
    h.setInputValue('description', this.project.description);
    return this;
  }
  submit() {
    let button = element(by.buttonText('Create'));
    button.click();
    return new CatalogPage(this.project);
  }
  // TODO: there is an implicit navigation here, this should return a new Overview page for clarity
  createProject() {
    this.enterProjectInfo();
    return this.submit();
  }
}

exports.CreateProjectPage = CreateProjectPage;
